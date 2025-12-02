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
                alert('Failed to export data');
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

            console.log('JSON exported successfully');
            return true;
        } catch (error) {
            console.error('Error exporting JSON:', error);
            alert('Failed to export data');
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
                alert('No data to export');
                return false;
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
            return true;
        } catch (error) {
            console.error('Error exporting CSV:', error);
            alert('Failed to export CSV');
            return false;
        }
    },

    /**
     * Export SVG chart to PNG image
     */
    async exportToPng(svgElementId = 'actigram') {
        try {
            const svg = document.getElementById(svgElementId);
            if (!svg) {
                console.error('SVG element not found');
                alert('Chart not found. Please ensure the chart is loaded.');
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
                        a.download = `webactigram-${new Date().toISOString().split('T')[0]}.png`;
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
                    alert('Failed to export PNG');
                    reject(false);
                };

                img.src = url;
            });
        } catch (error) {
            console.error('Error exporting PNG:', error);
            alert('Failed to export PNG');
            return false;
        }
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportUtils;
}
