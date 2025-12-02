/**
 * Popup UI Controller
 * Manages the popup interface and user interactions
 */

// State
let currentDaysToShow = 2;
let currentStartDate = new Date();
let activityData = [];
let settings = {};

/**
 * Initialize popup
 */
async function initialize() {
    console.log('Initializing popup...');

    // Initialize storage (IndexedDB)
    await StorageManager.initialize();

    // Load settings
    settings = await StorageManager.getSettings();

    // Load UI preferences
    const uiPreferences = await StorageManager.getUIPreferences();
    currentDaysToShow = uiPreferences.daysToShow;

    // Initialize chart (will auto-calculate width from container)
    ActigramChart.initialize('#actigram');

    // Set up event listeners
    setupEventListeners();

    // Set the dropdown to saved value
    document.getElementById('daysToShow').value = currentDaysToShow;

    // Load and display data
    await loadAndDisplayData();

    console.log('Popup initialized');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Date navigation
    document.getElementById('prevDay').addEventListener('click', () => {
        currentStartDate.setDate(currentStartDate.getDate() - 1);
        loadAndDisplayData();
    });

    document.getElementById('nextDay').addEventListener('click', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (currentStartDate < tomorrow) {
            currentStartDate.setDate(currentStartDate.getDate() + 1);
            loadAndDisplayData();
        }
    });

    // Days to show selector
    document.getElementById('daysToShow').addEventListener('change', async (e) => {
        const value = e.target.value;
        currentDaysToShow = value === 'all' ? 'all' : parseInt(value);

        // Save preference
        await StorageManager.saveUIPreferences({ daysToShow: currentDaysToShow });

        loadAndDisplayData();
    });

    // View mode selector
    document.getElementById('viewMode').addEventListener('change', (e) => {
        const mode = e.target.value;
        const daysControl = document.getElementById('daysControl');
        const rangeControl = document.getElementById('rangeControl');

        if (mode === 'days') {
            daysControl.style.display = 'flex';
            rangeControl.style.display = 'none';

            // Reset to today when switching back to days mode
            currentStartDate = new Date();
            loadAndDisplayData();
        } else {
            daysControl.style.display = 'none';
            rangeControl.style.display = 'flex';

            // Set default dates (last 7 days)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);

            document.getElementById('startDate').valueAsDate = startDate;
            document.getElementById('endDate').valueAsDate = endDate;
        }
    });

    // Apply date range button
    document.getElementById('applyRange').addEventListener('click', async () => {
        const startDate = document.getElementById('startDate').valueAsDate;
        const endDate = document.getElementById('endDate').valueAsDate;

        if (startDate && endDate && startDate <= endDate) {
            // Set currentStartDate to the END date (loadAndDisplayData calculates backwards)
            currentStartDate = new Date(endDate);
            const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            currentDaysToShow = daysDiff;

            // Save preference
            await StorageManager.saveUIPreferences({ daysToShow: currentDaysToShow });

            loadAndDisplayData();
        } else {
            alert('Please select a valid date range (start date must be before or equal to end date)');
        }
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportData);

    // Export as PNG button
    document.getElementById('exportPngBtn').addEventListener('click', exportToPng);

    // Export as CSV button
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);

    // Save as PDF button
    document.getElementById('printBtn').addEventListener('click', () => {
        // Set date for print header
        document.querySelector('header').setAttribute('data-date', new Date().toLocaleDateString());
        window.print();
    });

    // Options button
    document.getElementById('optionsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

/**
 * Load and display activity data
 */
async function loadAndDisplayData() {
    try {
        let startDate, endDate, daysToShow;

        if (currentDaysToShow === 'all') {
            // Load all available data
            activityData = await StorageManager.getActivityData();

            if (activityData.length === 0) {
                // No data available
                startDate = new Date();
                endDate = new Date();
                daysToShow = 0;
            } else {
                // Calculate date range from data
                const timestamps = activityData.map(d => d.timestamp);
                const minTime = Math.min(...timestamps);
                const maxTime = Math.max(...timestamps);

                startDate = new Date(minTime);
                startDate.setHours(0, 0, 0, 0);

                endDate = new Date(maxTime);
                endDate.setHours(23, 59, 59, 999);

                // Calculate days between
                daysToShow = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            }
        } else {
            // Calculate date range for specific number of days
            endDate = new Date(currentStartDate);
            endDate.setHours(23, 59, 59, 999);

            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - currentDaysToShow + 1);
            startDate.setHours(0, 0, 0, 0);

            daysToShow = currentDaysToShow;

            // Load data for date range
            activityData = await StorageManager.getActivityData(
                startDate.getTime(),
                endDate.getTime()
            );
        }

        console.log(`Loaded ${activityData.length} data points for ${daysToShow} days`);

        // Update date range display
        updateDateRangeDisplay(startDate, endDate);

        // Render chart
        ActigramChart.render(activityData, daysToShow, settings.epochDuration, settings.plotType);

        // Update statistics
        updateStatistics();

    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load activity data');
    }
}

/**
 * Update date range display
 */
function updateDateRangeDisplay(startDate, endDate) {
    const formatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', formatOptions);
    const endStr = endDate.toLocaleDateString('en-US', formatOptions);

    const dateRangeEl = document.getElementById('dateRange');
    if (startStr === endStr) {
        dateRangeEl.textContent = startStr;
    } else {
        dateRangeEl.textContent = `${startStr} - ${endStr}`;
    }

    // Disable navigation buttons when viewing all time
    const isAllTime = currentDaysToShow === 'all';
    document.getElementById('prevDay').disabled = isAllTime;
    document.getElementById('nextDay').disabled = isAllTime;
}

/**
 * Update statistics display
 */
function updateStatistics() {
    if (!activityData || activityData.length === 0) {
        document.getElementById('totalActivity').textContent = '0%';
        document.getElementById('avgScore').textContent = '0%';
        document.getElementById('dataPoints').textContent = '0';
        return;
    }

    // Calculate total activity (sum of all scores)
    const totalScore = activityData.reduce((sum, epoch) => sum + epoch.activityScore, 0);
    const avgScore = Math.round(totalScore / activityData.length);

    // Calculate total activity percentage
    const maxPossibleScore = activityData.length * 100;
    const totalActivityPercent = Math.round((totalScore / maxPossibleScore) * 100);

    // Update display
    document.getElementById('totalActivity').textContent = `${totalActivityPercent}%`;
    document.getElementById('avgScore').textContent = `${avgScore}%`;
    document.getElementById('dataPoints').textContent = activityData.length.toLocaleString();
}

/**
 * Export data to JSON file
 */
async function exportData() {
    try {
        const exportObject = await StorageManager.exportData();

        if (!exportObject) {
            showError('Failed to export data');
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

        console.log('Data exported successfully');
    } catch (error) {
        console.error('Error exporting data:', error);
        showError('Failed to export data');
    }
}

/**
 * Export data to CSV file
 */
async function exportToCsv() {
    try {
        if (!activityData || activityData.length === 0) {
            alert('No data to export');
            return;
        }

        // Create CSV content
        const headers = ['Timestamp', 'Date', 'Time', 'Activity Score'];
        const rows = activityData.map(epoch => {
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

        console.log('CSV exported successfully');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Failed to export CSV');
    }
}

/**
 * Export actigram as PNG image
 */
async function exportToPng() {
    try {
        const svg = document.getElementById('actigram');
        if (!svg) {
            console.error('SVG element not found');
            return;
        }

        // Get SVG dimensions
        const svgRect = svg.getBoundingClientRect();
        const svgData = new XMLSerializer().serializeToString(svg);

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size to match SVG
        canvas.width = svgRect.width;
        canvas.height = svgRect.height;

        // Create image from SVG
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = function () {
            // Draw white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw SVG onto canvas
            ctx.drawImage(img, 0, 0);

            // Convert canvas to PNG and download
            canvas.toBlob(function (blob) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `WebActigram_${timestamp}.png`;

                const link = document.createElement('a');
                link.download = filename;
                link.href = URL.createObjectURL(blob);
                link.click();

                // Cleanup
                URL.revokeObjectURL(url);
                URL.revokeObjectURL(link.href);
            });
        };

        img.src = url;
    } catch (error) {
        console.error('Error exporting PNG:', error);
        alert('Failed to export PNG. Please try again.');
    }
}

/**
 * Show error message
 */
function showError(message) {
    // Simple error display - could be enhanced with a modal or toast
    alert(message);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
