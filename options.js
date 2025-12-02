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

    // Initialize storage (IndexedDB)
    await StorageManager.initialize();

    // Load current settings
    await loadSettings();

    // Load storage info
    await loadStorageInfo();

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
    document.getElementById('exportPngBtn').addEventListener('click', exportToPng);

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    // File input change
    document.getElementById('importFile').addEventListener('change', handleFileSelect);

    // Clear data button
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
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
    try {
        const exportObject = await StorageManager.exportData();

        if (!exportObject) {
            showStatus('Failed to export data', 'error');
            return;
        }

        // Create blob and download
        const blob = new Blob([JSON.stringify(exportObject, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webactigram-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showStatus('Failed to export data', 'error');
    }
}

/**
 * Export data as CSV
 */
async function exportToCsv() {
    try {
        const data = await StorageManager.getActivityData();

        if (!data || data.length === 0) {
            showStatus('No data to export', 'error');
            return;
        }

        // Create CSV content
        const headers = ['Timestamp', 'Date', 'Time', 'Activity Score'];
        const rows = data.map(epoch => {
            const date = new Date(epoch.timestamp);
            // Use MM/DD/YYYY format which Excel auto-recognizes as Short Date
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            const formattedDate = `${month}/${day}/${year}`;
            const time = date.toTimeString().split(' ')[0]; // HH:MM:SS
            return [
                `="${epoch.timestamp}"`, // Format as text for Excel to prevent scientific notation
                formattedDate,
                time,
                epoch.activityScore
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webactigram-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus('CSV exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showStatus('Failed to export CSV', 'error');
    }
}

/**
 * Export actigram as PNG (requires chart to be rendered)
 */
async function exportToPng() {
    try {
        showStatus('Opening chart for PNG export...', 'pending');

        // Open popup with auto-export parameter
        const popupUrl = chrome.runtime.getURL('popup.html?autoExport=png');
        window.open(popupUrl, '_blank');

        showStatus('Chart opened - PNG export will start automatically', 'success');
    } catch (error) {
        console.error('Error exporting PNG:', error);
        showStatus('Failed to export PNG', 'error');
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
    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = message;
    statusEl.className = 'save-status ' + type;

    // Clear after 2 seconds for success
    if (type === 'success') {
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'save-status';
        }, 2000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
