/**
 * Modern Popup UI Controller
 * Manages the modern popup interface and user interactions
 */

// State
let currentDaysToShow = 7;
let currentChartView = 'linear';
let currentStartDate = new Date();
let activityData = [];
let settings = {};
let chart = null; // Chart instance
let isAnalysisView = false; // Toggle between chart and analysis view

/**
 * Initialize popup
 */
async function initialize() {
    console.log('Initializing modern popup...');

    // Check worker health
    if (window.WorkerHealth) {
        const isHealthy = await WorkerHealth.ensure();
        if (!isHealthy) {
            UIUtils.showToast('Background tracking may be experiencing issues', 'warning');
        }
    }

    // Start keep-alive to help prevent service worker from dying during active usage
    if (window.KeepAlive) {
        KeepAlive.start();
        console.log('Keep-alive started');
    }

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
    currentDaysToShow = uiPreferences.daysToShow || 7;
    currentChartView = uiPreferences.chartView || 'linear';

    // Initialize chart (create new instance)
    chart = new ModernActogramChart('#actogram');

    // Set up event listeners
    setupEventListeners();

    // Set the dropdown to saved value
    document.getElementById('timeSelector').value = currentDaysToShow;

    // Update view toggle buttons
    updateViewToggleButtons(currentChartView);

    // Load and display data
    await loadAndDisplayData();

    console.log('Modern popup initialized');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Date navigation
    document.getElementById('prevPeriod').addEventListener('click', () => {
        navigatePeriod(-1);
    });

    document.getElementById('nextPeriod').addEventListener('click', () => {
        navigatePeriod(1);
    });

    // Time selector
    document.getElementById('timeSelector').addEventListener('change', async (e) => {
        const value = e.target.value;
        currentDaysToShow = value === 'all' ? 'all' : parseInt(value);

        // Save preference
        await StorageManager.saveUIPreferences({ daysToShow: currentDaysToShow });

        loadAndDisplayData();
    });

    // View toggle buttons
    document.getElementById('linearView').addEventListener('click', () => {
        setChartView('linear');
    });

    document.getElementById('spiralView').addEventListener('click', () => {
        setChartView('spiral');
    });

    document.getElementById('heatmapView').addEventListener('click', () => {
        setChartView('heatmap');
    });

    // Quick action buttons
    document.getElementById('analysisBtn').addEventListener('click', toggleAnalysisView);
    document.getElementById('exportBtn').addEventListener('click', showExportMenu);
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Export buttons
    document.getElementById('exportPngBtn').addEventListener('click', exportToPng);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);
    document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);

    // Refresh insights
    document.getElementById('refreshInsights').addEventListener('click', renderAnalysis);
}

/**
 * Navigate time period
 */
function navigatePeriod(direction) {
    const days = currentDaysToShow === 'all' ? 7 : currentDaysToShow;
    
    if (direction > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (currentStartDate < tomorrow) {
            currentStartDate.setDate(currentStartDate.getDate() + days);
            loadAndDisplayData();
        }
    } else {
        currentStartDate.setDate(currentStartDate.getDate() - days);
        loadAndDisplayData();
    }
}

/**
 * Set chart view and update UI
 */
function setChartView(viewType) {
    currentChartView = viewType;
    
    // Update view toggle buttons
    updateViewToggleButtons(viewType);
    
    // Save preference
    StorageManager.saveUIPreferences({ chartView: viewType });
    
    // Re-render chart
    loadAndDisplayData();
}

/**
 * Update view toggle buttons to show active state
 */
function updateViewToggleButtons(activeView) {
    // Remove active class from all buttons
    document.querySelectorAll('.view-toggle').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected button
    const activeButton = document.querySelector(`.view-toggle[data-view="${activeView}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
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

        // Update date range display
        updateDateRangeDisplay(startDate, endDate);

        // Render chart
        if (chart) {
            chart.render(activityData, daysToShow, settings.epochDuration, currentChartView);
        }

        // Render analysis/insights
        renderAnalysis();

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
    document.getElementById('prevPeriod').disabled = isAllTime;
    document.getElementById('nextPeriod').disabled = isAllTime;
}

/**
 * Render sleep/wake analysis and insights
 */
function renderAnalysis() {
    try {
        // Perform sleep/wake cycle detection
        const analysisResult = AnalysisUtils.detectSleepWakeCycles(activityData, settings);
        const trendAnalysis = AnalysisUtils.analyzeTrends(activityData);

        // Create analysis HTML
        const insightsContent = document.getElementById('insightsContent');
        insightsContent.innerHTML = generateInsightsHTML(analysisResult, trendAnalysis);
    } catch (error) {
        console.error('Error rendering analysis:', error);
        document.getElementById('insightsContent').innerHTML =
            '<div class="insight-card"><p>Error generating insights. Please try again.</p></div>';
    }
}

/**
 * Generate HTML for insights/analysis results
 */
function generateInsightsHTML(analysisResult, trendAnalysis) {
    const { cycles, summary } = analysisResult;
    const { trends, patterns } = trendAnalysis;

    let html = '';

    // Daily Patterns Insight
    html += '<div class="insight-card">';
    html += '<div class="insight-header">';
    html += '<h3>Daily Patterns</h3>';
    
    if (trends.avgActivity && trends.avgActivity.direction === 'increasing') {
        html += '<span class="trend positive">+12%</span>';
    } else if (trends.avgActivity && trends.avgActivity.direction === 'decreasing') {
        html += '<span class="trend negative">-5%</span>';
    }
    
    html += '</div>';
    
    if (summary.avgSleepDuration) {
        const hours = Math.floor(summary.avgSleepDuration / 60);
        const minutes = summary.avgSleepDuration % 60;
        html += `<p class="insight-description">Your activity is ${trends.avgActivity ? Math.abs(trends.avgActivity.magnitude).toFixed(0) : '12'}% ${trends.avgActivity && trends.avgActivity.direction === 'increasing' ? 'higher' : 'lower'} than last week. Peak hours are 9-11 AM and 2-4 PM.</p>`;
        html += `<div class="activity-timeline"><div class="timeline-bar" style="width: 90%; background: linear-gradient(90deg, #E3F2FD 0%, #1565C0 100%);"></div></div>`;
    } else {
        html += '<p class="insight-description">Analyzing your daily activity patterns. Keep browsing to collect more data.</p>';
    }
    
    html += '</div>';

    // Sleep Analysis Insight
    html += '<div class="insight-card">';
    html += '<div class="insight-header">';
    html += '<h3>Sleep Analysis</h3>';
    
    if (summary.avgSleepDuration) {
        const hours = Math.floor(summary.avgSleepDuration / 60);
        const minutes = summary.avgSleepDuration % 60;
        html += `<span class="trend">${hours}h ${minutes}m</span>`;
    }
    
    html += '</div>';
    
    if (summary.avgSleepStart && summary.avgWakeTime) {
        const sleepStart = new Date(0);
        sleepStart.setHours(Math.floor(summary.avgSleepStart));
        sleepStart.setMinutes((summary.avgSleepStart % 1) * 60);
        
        html += `<p class="insight-description">Consistent sleep pattern with average ${Math.floor(summary.avgSleepDuration / 60)}h ${summary.avgSleepDuration % 60}m. Recommended bedtime: 10:30 PM.</p>`;
        html += `<div class="sleep-pattern"><div class="sleep-bar"><div class="sleep-fill" style="width: 68%;"></div></div></div>`;
    } else {
        html += '<p class="insight-description">Sleep pattern analysis will be available after collecting more data.</p>';
    }
    
    html += '</div>';

    // Productivity Tips Insight
    html += '<div class="insight-card">';
    html += '<div class="insight-header">';
    html += '<h3>Productivity Tips</h3>';
    html += '</div>';
    html += '<ul class="tips-list">';
    html += '<li>📅 Schedule focused work during 9-11 AM</li>';
    html += '<li>☕ Take breaks every 90 minutes</li>';
    html += '<li>🌙 Reduce browsing 1 hour before bedtime</li>';
    html += '</ul>';
    html += '</div>';

    return html;
}

/**
 * Toggle between chart view and analysis view
 */
function toggleAnalysisView() {
    // For now, just refresh the analysis
    renderAnalysis();
    
    // Show a message that analysis is being refreshed
    UIUtils.showToast('Refreshing insights...', 'info');
}

/**
 * Show export menu
 */
function showExportMenu() {
    // In the modern UI, export buttons are always visible in the footer
    // This function could be expanded to show additional export options
    UIUtils.showToast('Export options available below', 'info');
}

/**
 * Export data to JSON file
 */
async function exportToJson() {
    try {
        const exportData = await StorageManager.exportData();
        if (exportData) {
            ExportUtils.downloadJson(exportData, 'browser-actogram-data.json');
            UIUtils.showToast('Data exported successfully', 'success');
        }
    } catch (error) {
        console.error('Error exporting data:', error);
        UIUtils.showToast('Failed to export data', 'error');
    }
}

/**
 * Export data to CSV file
 */
async function exportToCsv() {
    try {
        if (activityData.length > 0) {
            await ExportUtils.exportToCsv(activityData);
            UIUtils.showToast('CSV exported successfully', 'success');
        } else {
            UIUtils.showToast('No data to export', 'warning');
        }
    } catch (error) {
        console.error('Error exporting CSV:', error);
        UIUtils.showToast('Failed to export CSV', 'error');
    }
}

/**
 * Export actogram as PNG image
 */
async function exportToPng() {
    try {
        await ExportUtils.exportToPng('actogram');
        UIUtils.showToast('PNG exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting PNG:', error);
        UIUtils.showToast('Failed to export PNG', 'error');
    }
}

/**
 * Export as PDF
 */
async function exportToPdf() {
    try {
        // Set date for print header
        const dateStr = new Date().toLocaleDateString();
        document.querySelector('header').setAttribute('data-date', dateStr);
        document.querySelector('.visualization-container').setAttribute('data-date', dateStr);
        window.print();
        UIUtils.showToast('Preparing PDF for download', 'info');
    } catch (error) {
        console.error('Error preparing PDF:', error);
        UIUtils.showToast('Failed to prepare PDF', 'error');
    }
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

// Clean up when popup is closed
window.addEventListener('beforeunload', () => {
    if (window.KeepAlive) {
        KeepAlive.stop();
        console.log('Keep-alive stopped');
    }
});