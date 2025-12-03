/**
 * Options Page Controller
 * Manages settings and data management
 */

// Current settings
let currentSettings = {};

/**
 * Initialize options page
 */
async function initialize() {
    console.log('Initializing options page...');

    // Global error handlers
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled rejection:', event.reason);
        UIUtils.showToast(`Error: ${event.reason.message || event.reason}`, 'error');
    });

    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        UIUtils.showToast(`Error: ${event.message}`, 'error');
    });

    // Initialize storage (IndexedDB)
    await StorageManager.initialize();

    // Load current settings
    await loadSettings();

    // Load storage info
    await loadStorageInfo();

    // Check history data existence
    checkHistoryDataExistence();

    // Set up event listeners
    setupEventListeners();

    console.log('Options page initialized');
}

/**
 * Load current settings
 */
async function loadSettings() {
    currentSettings = await StorageManager.getSettings();

    // Populate form
    document.getElementById('epochDuration').value = currentSettings.epochDuration;
    document.getElementById('idleThreshold').value = currentSettings.idleThreshold;
    document.getElementById('retentionDays').value = currentSettings.retentionDays;
    document.getElementById('plotType').value = currentSettings.plotType || 'double';
}

/**
 * Load storage information
 */
async function loadStorageInfo() {
    try {
        const allData = await StorageManager.getActivityData();

        document.getElementById('dataPointCount').textContent = allData.length.toLocaleString();

        if (allData.length > 0) {
            const oldestTimestamp = Math.min(...allData.map(d => d.timestamp));
            const newestTimestamp = Math.max(...allData.map(d => d.timestamp));

            document.getElementById('oldestData').textContent = new Date(oldestTimestamp).toLocaleDateString();
            document.getElementById('newestData').textContent = new Date(newestTimestamp).toLocaleDateString();
        } else {
            document.getElementById('oldestData').textContent = 'No data';
            document.getElementById('newestData').textContent = 'No data';
        }
    } catch (error) {
        console.error('Error loading storage info:', error);
        document.getElementById('dataPointCount').textContent = 'Error';
        document.getElementById('oldestData').textContent = 'Error';
        document.getElementById('newestData').textContent = 'Error';
    }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Auto-save on change for all settings
    const settingInputs = ['epochDuration', 'idleThreshold', 'retentionDays', 'plotType'];

    settingInputs.forEach(id => {
        document.getElementById(id).addEventListener('change', autoSaveSettings);
    });

    // Export buttons
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    // File input change
    document.getElementById('importFile').addEventListener('change', handleFileSelect);

    // Clear data button
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);

    // History Import Controls
    document.getElementById('checkHistoryBtn').addEventListener('click', checkHistoryPermission);
    document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
    document.getElementById('cancelHistoryBtn').addEventListener('click', () => {
        document.getElementById('historyPreview').style.display = 'none';
        document.getElementById('checkHistoryBtn').style.display = 'inline-block';
    });
    document.getElementById('deleteHistoryBtn').addEventListener('click', deleteHistoryData);
}

/**
 * Auto-save settings
 */
async function autoSaveSettings() {
    try {
        showStatus('Saving...', 'pending');

        const newSettings = {
            epochDuration: parseInt(document.getElementById('epochDuration').value),
            idleThreshold: parseInt(document.getElementById('idleThreshold').value),
            retentionDays: parseInt(document.getElementById('retentionDays').value),
            plotType: document.getElementById('plotType').value,
            colorScheme: 'blue' // Fixed for now
        };

        const success = await StorageManager.saveSettings(newSettings);

        if (success) {
            currentSettings = newSettings;
            showStatus('Settings saved', 'success');

            // Trigger cleanup if retention period changed
            if (newSettings.retentionDays !== currentSettings.retentionDays) {
                await StorageManager.cleanupOldData();
            }
        } else {
            showStatus('Failed to save', 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving', 'error');
    }
}

/**
 * Export data as JSON
 */
async function exportData() {
    const success = await ExportUtils.exportToJson();
    if (success) {
        showStatus('Data exported successfully!', 'success');
    } else {
        showStatus('Failed to export data', 'error');
    }
}

/**
 * Export data as CSV
 */
async function exportToCsv() {
    const success = await ExportUtils.exportToCsv();
    if (success) {
        showStatus('CSV exported successfully!', 'success');
    } else {
        showStatus('Failed to export CSV', 'error');
    }
}



/**
 * Handle file selection for import
 */
function handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    document.getElementById('fileName').textContent = file.name;

    // Read and import file
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const importData = JSON.parse(e.target.result);
            const mergeMode = document.getElementById('mergeData').checked;

            const success = await StorageManager.importData(importData, mergeMode);

            if (success) {
                const action = mergeMode ? 'merged' : 'imported';
                showStatus(`Data ${action} successfully!`, 'success');

                // Reload storage info
                await loadStorageInfo();
            } else {
                showStatus('Failed to import data', 'error');
            }
        } catch (error) {
            console.error('Error importing data:', error);
            showStatus('Invalid file format', 'error');
        }

        // Reset file input
        event.target.value = '';
        document.getElementById('fileName').textContent = 'No file selected';
    };

    reader.onerror = () => {
        showStatus('Failed to read file', 'error');
    };

    reader.readAsText(file);
}

/**
 * Check and request history permission
 */
async function checkHistoryPermission() {
    try {
        // Check if we have permission
        const hasPermission = await chrome.permissions.contains({
            permissions: ['history']
        });

        if (hasPermission) {
            previewHistoryImport();
        } else {
            // Request permission
            const granted = await chrome.permissions.request({
                permissions: ['history']
            });

            if (granted) {
                previewHistoryImport();
            } else {
                showStatus('Permission denied', 'error');
            }
        }
    } catch (error) {
        console.error('Error checking permissions:', error);
        showStatus('Error checking permissions', 'error');
    }
}

/**
 * Preview history import count
 */
async function previewHistoryImport() {
    try {
        showStatus('Scanning history...', 'pending');

        // Calculate start time based on retention settings
        const settings = await StorageManager.getSettings();
        let startTime = 0; // Default to all time

        if (settings.retentionDays > 0) {
            startTime = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
        }

        // Search history
        const results = await chrome.history.search({
            text: '',
            startTime: startTime,
            endTime: Date.now(),
            maxResults: 0 // Get all
        });

        // We need to get actual visits to count timestamps
        // This might be slow for large history, so we'll do a sample or just count items for now?
        // The plan said "Convert results to a count only".
        // chrome.history.search returns HistoryItems (last visit time), not all visits.
        // To get all visits, we need getVisits for each URL.
        // For the preview, maybe just showing the number of unique URLs (HistoryItems) is enough?
        // Or we can do a quick estimate.
        // Let's count HistoryItems for the preview to be fast.

        const count = results.length;

        document.getElementById('historyCountMsg').textContent =
            `Found ${count.toLocaleString()} history items in the retention period. ` +
            `Importing will retrieve all visit timestamps for these items.`;

        document.getElementById('historyPreview').style.display = 'block';
        document.getElementById('checkHistoryBtn').style.display = 'none';

        showStatus('Scan complete', 'success');

    } catch (error) {
        console.error('Error previewing history:', error);
        showStatus('Error scanning history', 'error');
    }
}

/**
 * Import history data
 */
async function importHistory() {
    try {
        showStatus('Importing history...', 'pending');
        document.getElementById('importHistoryBtn').disabled = true;

        // Calculate start time
        const settings = await StorageManager.getSettings();
        let startTime = 0;
        if (settings.retentionDays > 0) {
            startTime = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
        }

        // 1. Get all history items
        const historyItems = await chrome.history.search({
            text: '',
            startTime: startTime,
            endTime: Date.now(),
            maxResults: 0
        });

        // 2. Get visits for each item (in batches to avoid UI freeze)
        let allVisits = [];
        const batchSize = 50;

        for (let i = 0; i < historyItems.length; i += batchSize) {
            const batch = historyItems.slice(i, i + batchSize);
            const visitPromises = batch.map(item => chrome.history.getVisits({ url: item.url }));
            const batchVisits = await Promise.all(visitPromises);

            // Flatten and filter by time
            batchVisits.flat().forEach(visit => {
                if (visit.visitTime >= startTime) {
                    allVisits.push(visit);
                }
            });

            // Update status occasionally
            if (i % 500 === 0) {
                showStatus(`Fetched ${allVisits.length} visits...`, 'pending');
            }
        }

        // 3. Import to StorageManager
        const success = await StorageManager.importHistoryData(allVisits, settings.epochDuration);

        if (success) {
            showStatus(`Successfully imported ${allVisits.length} visits!`, 'success');
            document.getElementById('historyPreview').style.display = 'none';
            document.getElementById('checkHistoryBtn').style.display = 'inline-block';

            // Refresh info
            await loadStorageInfo();
            checkHistoryDataExistence();
        } else {
            showStatus('Import failed', 'error');
        }

    } catch (error) {
        console.error('Error importing history:', error);
        showStatus('Error importing history', 'error');
    } finally {
        document.getElementById('importHistoryBtn').disabled = false;
    }
}

/**
 * Delete imported history
 */
async function deleteHistoryData() {
    if (!confirm('Are you sure you want to delete all imported history data? Your tracked activity will remain.')) {
        return;
    }

    try {
        showStatus('Deleting history data...', 'pending');
        const success = await StorageManager.deleteHistoryData();

        if (success) {
            showStatus('History data deleted', 'success');
            await loadStorageInfo();
            checkHistoryDataExistence();
        } else {
            showStatus('Failed to delete history data', 'error');
        }
    } catch (error) {
        console.error('Error deleting history:', error);
        showStatus('Error deleting history', 'error');
    }
}

/**
 * Check if history data exists to show/hide delete button
 */
async function checkHistoryDataExistence() {
    // We'd need a way to check this efficiently. 
    // For now, let's just show it if we have any data, or maybe we can add a method to StorageManager?
    // Or just always show it if permission is granted?
    // Let's leave it hidden by default and only show if we just imported, 
    // or if we implement a check.
    // For now, let's just show it if permission is granted.

    const hasPermission = await chrome.permissions.contains({ permissions: ['history'] });
    if (hasPermission) {
        document.getElementById('historyDeleteControls').style.display = 'block';
    }
}

/**
 * Clear all data
 */
async function clearAllData() {
    const confirmed = confirm(
        'Are you sure you want to delete ALL activity data?\n\n' +
        'This action cannot be undone. Consider exporting your data first.'
    );

    if (!confirmed) {
        return;
    }

    // Double confirmation
    const doubleConfirmed = confirm(
        'This is your last chance!\n\n' +
        'Click OK to permanently delete all data.'
    );

    if (!doubleConfirmed) {
        return;
    }

    try {
        const success = await StorageManager.clearAllData();

        if (success) {
            showStatus('All data cleared', 'success');
            await loadStorageInfo();
        } else {
            showStatus('Failed to clear data', 'error');
        }
    } catch (error) {
        console.error('Error clearing data:', error);
        showStatus('Error clearing data', 'error');
    }
}

/**
 * Show status message
 */
function showStatus(message, type = '') {
    // Map legacy types to UIUtils types
    const uiType = type === 'pending' ? 'pending' :
        type === 'success' ? 'success' :
            type === 'error' ? 'error' : 'info';

    UIUtils.showToast(message, uiType);

    // Also update the legacy status element if it exists, for fallback
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'save-status ' + type;

        if (type === 'success') {
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'save-status';
            }, 2000);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
