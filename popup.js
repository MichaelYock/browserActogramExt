/**
 * Popup UI Controller
 * Manages the popup interface and user interactions
 */

// State
let currentDaysToShow = 2;
let currentStartDate = new Date();
let activityData = [];
let settings = {};
let chart = null; // Chart instance

/**
 * Initialize popup
 */
async function initialize() {
    console.log('Initializing popup...');

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

    // Load settings
    settings = await StorageManager.getSettings();

    // Load UI preferences
    const uiPreferences = await StorageManager.getUIPreferences();
    currentDaysToShow = uiPreferences.daysToShow;

    // Initialize chart (create new instance)
    chart = new ActigramChart('#actigram');

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
            loadAndDisplayData();
        } else {
            UIUtils.showToast('Please select a valid date range (start date must be before or equal to end date)', 'error');
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
        const dateStr = new Date().toLocaleDateString();
        document.querySelector('header').setAttribute('data-date', dateStr);
        document.getElementById('chart-container').setAttribute('data-date', dateStr);
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
            // Limit "All time" to maximum of 365 days for performance
            const MAX_DAYS_ALL_TIME = 365;

            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);

            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - MAX_DAYS_ALL_TIME + 1);
            startDate.setHours(0, 0, 0, 0);

            // Load data for the date range
            activityData = await StorageManager.getActivityData(
                startDate.getTime(),
                endDate.getTime()
            );

            if (activityData.length === 0) {
                // No data available
                daysToShow = 0;
            } else {
                // Calculate actual days from the data
                const timestamps = activityData.map(d => d.timestamp);
                const minTime = Math.min(...timestamps);
                const maxTime = Math.max(...timestamps);

                const actualStartDate = new Date(minTime);
                actualStartDate.setHours(0, 0, 0, 0);

                const actualEndDate = new Date(maxTime);
                actualEndDate.setHours(23, 59, 59, 999);

                // Update display dates to actual data range
                startDate = actualStartDate;
                endDate = actualEndDate;

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
        chart.render(activityData, daysToShow, settings.epochDuration, settings.plotType);



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
 * Export data to JSON file
 */
async function exportData() {
    return await ExportUtils.exportToJson();
}

/**
 * Export data to CSV file
 */
async function exportToCsv() {
    return await ExportUtils.exportToCsv(activityData);
}

/**
 * Export actigram as PNG image
 */
async function exportToPng() {
    return await ExportUtils.exportToPng('actigram');
}

/**
 * Show error message
 */
function showError(message) {
    UIUtils.showToast(message, 'error');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
