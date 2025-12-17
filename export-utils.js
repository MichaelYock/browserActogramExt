/**
 * Export Utilities
 * Shared export functions for JSON, CSV, and PNG exports
 */

const ExportUtils = {
    /**
     * Export data to JSON file
     */
    async exportToJson() {
        try {
            const exportObject = await StorageManager.exportData();

            if (!exportObject) {
                UIUtils.showToast('Failed to export data', 'error');
                return;
            }

            // Create blob and download
            const blob = new Blob([JSON.stringify(exportObject, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `browser-actogram-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('JSON exported successfully');
            return true;
        } catch (error) {
            console.error('Error exporting JSON:', error);
            UIUtils.showToast('Failed to export data', 'error');
            return false;
        }
    },

    /**
     * Export data to CSV file
     */
    async exportToCsv(data = null) {
        try {
            // If no data provided, get all activity data
            const activityData = data || await StorageManager.getActivityData();

            if (!activityData || activityData.length === 0) {
                UIUtils.showToast('No data to export', 'info');
                return false;
            }

            // Create CSV content
            const headers = ['Timestamp', 'Date', 'Time', 'Activity Score'];
            const rows = activityData.map(epoch => this.formatCsvRow(epoch));

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `browser-actogram-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('CSV exported successfully');
            return true;
        } catch (error) {
            console.error('Error exporting CSV:', error);
            UIUtils.showToast('Failed to export CSV', 'error');
            return false;
        }
    },

    /**
     * Export SVG chart to PNG image
     */
    async exportToPng(svgElementId = 'actogram') {
        try {
            const svg = document.getElementById(svgElementId);
            if (!svg) {
                console.error('SVG element not found');
                UIUtils.showToast('Chart not found. Please ensure the chart is loaded.', 'error');
                return false;
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

            return new Promise((resolve, reject) => {
                img.onload = function () {
                    // Draw white background
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Draw SVG
                    ctx.drawImage(img, 0, 0);

                    // Convert to PNG and download
                    canvas.toBlob(function (blob) {
                        const pngUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = pngUrl;
                        a.download = `browser-actogram-${new Date().toISOString().split('T')[0]}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);

                        // Cleanup
                        URL.revokeObjectURL(url);
                        URL.revokeObjectURL(pngUrl);

                        console.log('PNG exported successfully');
                        resolve(true);
                    });
                };

                img.onerror = function () {
                    URL.revokeObjectURL(url);
                    console.error('Error loading SVG image');
                    UIUtils.showToast('Failed to export PNG', 'error');
                    reject(false);
                };

                img.src = url;
            });
        } catch (error) {
            console.error('Error exporting PNG:', error);
            UIUtils.showToast('Failed to export PNG', 'error');
            return false;
        }
    },

    /**
     * Format a single epoch for CSV output
     * @param {Object} epoch - Activity epoch
     * @returns {Array} CSV row array
     */
    formatCsvRow(epoch) {
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
    },

    /**
     * Download JSON data as file
     * @param {Object} data - Data to download
     * @param {string} filename - Filename for download
     */
    downloadJson(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportUtils;
}
