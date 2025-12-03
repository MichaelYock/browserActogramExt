/**
 * Actigram Chart using D3.js
 * Renders activity data as a heatmap-style actigram
 */

class ActigramChart {
    // Color thresholds for activity levels
    static colorThresholds = [0, 20, 40, 60, 80, 100];
    static colors = ['#E3F2FD', '#90CAF9', '#42A5F5', '#1E88E5', '#1565C0'];

    /**
     * Create a new ActigramChart instance
     * @param {string} containerId - CSS selector for the SVG element
     * @param {number} width - Optional width override
     */
    constructor(containerId, width = null) {
        // Chart configuration
        this.config = {
            margin: { top: 40, right: 60, bottom: 40, left: 80 },
            cellHeight: 30,
            cellPadding: 0,
            colorScale: null,
            svg: null,
            width: 0,
            height: 0
        };

        this.config.svg = d3.select(containerId);

        // Get width from container if not specified
        if (!width) {
            const container = document.querySelector(containerId);
            if (container) {
                width = container.parentElement.clientWidth - 30; // Account for padding
            } else {
                width = 700; // Fallback
            }
        }

        this.config.width = width - this.config.margin.left - this.config.margin.right;

        // Create color scale
        this.config.colorScale = d3.scaleThreshold()
            .domain([20, 40, 60, 80])
            .range(ActigramChart.colors);
    }

    /**
     * Render the actigram chart
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} plotType - 'single' or 'double'
     */
    render(data, daysToShow = 2, epochDuration = 15, plotType = 'double') {
        if (!this.config.svg) {
            console.error('Chart not initialized');
            return;
        }

        // Clear existing chart
        this.config.svg.selectAll('*').remove();

        // Check if we have data
        if (!data || data.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Process data into grid format
        const gridData = this.processDataToGrid(data, daysToShow, epochDuration, plotType);

        if (gridData.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate dimensions
        const hoursPerRow = plotType === 'double' ? 48 : 24;
        const epochsPerRow = (hoursPerRow * 60) / epochDuration;
        const cellWidth = this.config.width / epochsPerRow;

        // Calculate cellHeight so that height = width of one hour
        // For a 15-min epoch: cellHeight = cellWidth * 4 (4 epochs per hour)
        // For a 60-min epoch: cellHeight = cellWidth * 1 (1 epoch per hour)
        const cellHeight = cellWidth * (60 / epochDuration);
        this.config.cellHeight = cellHeight;
        this.config.height = gridData.length * cellHeight;

        // Set SVG dimensions
        const totalWidth = this.config.width + this.config.margin.left + this.config.margin.right;
        const totalHeight = this.config.height + this.config.margin.top + this.config.margin.bottom;

        this.config.svg
            .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .style('width', '100%')
            .style('height', 'auto');

        // Create main group
        const g = this.config.svg.append('g')
            .attr('transform', `translate(${this.config.margin.left},${this.config.margin.top})`);

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, hoursPerRow])
            .range([0, this.config.width]);

        const yScale = d3.scaleBand()
            .domain(gridData.map(d => d.date))
            .range([0, this.config.height])
            .padding(0.1);

        // Add X axis (hours) - DRAW AXES FIRST
        const xAxis = d3.axisTop(xScale)
            .ticks(hoursPerRow === 48 ? 24 : 24) // Show tick every 2 hours for double plot?
            .tickValues(plotType === 'double'
                ? d3.range(0, 49, 4) // Every 4 hours for double plot
                : d3.range(0, 25, 1)) // Every 1 hour for single plot
            .tickFormat(d => {
                const h = d % 24;
                return `${Math.floor(h)}:00`;
            });

        g.append('g')
            .attr('class', 'axis x-axis')
            .call(xAxis)
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'start');

        // Add Y axis (dates)
        const yAxis = d3.axisLeft(yScale);

        g.append('g')
            .attr('class', 'axis y-axis')
            .call(yAxis);

        // Add axis labels
        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -25)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#666')
            .text('Time of Day');

        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.config.height / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#666')
            .text('Date');

        // Draw cells AFTER axes so they appear on top
        gridData.forEach((dayData, dayIndex) => {
            dayData.epochs.forEach(epoch => {
                // For double plot, epoch.hour can go up to 48
                const x = xScale(epoch.hour);
                const y = dayIndex * this.config.cellHeight;
                const width = cellWidth - this.config.cellPadding;
                const height = this.config.cellHeight - this.config.cellPadding;

                // Use white/transparent for epochs with no activity
                let fillColor;
                if (!epoch.hasData || epoch.activityScore === 0) {
                    fillColor = 'white';
                } else {
                    fillColor = this.config.colorScale(epoch.activityScore);
                }

                g.append('rect')
                    .attr('class', 'activity-cell')
                    .attr('x', x)
                    .attr('y', y)
                    .attr('width', width)
                    .attr('height', height)
                    .attr('fill', fillColor)
                    .attr('style', `fill: ${fillColor}`)
                    .on('mouseover', (event) => this.showTooltip(event, epoch))
                    .on('mouseout', () => this.hideTooltip());
            });

            // Add separator line for double plot (at 24h mark)
            if (plotType === 'double') {
                g.append('line')
                    .attr('x1', xScale(24))
                    .attr('y1', dayIndex * this.config.cellHeight)
                    .attr('x2', xScale(24))
                    .attr('y2', (dayIndex + 1) * this.config.cellHeight)
                    .attr('stroke', '#ccc')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4,2');
            }
        });
    }

    /**
     * Process raw data into grid format
     */
    processDataToGrid(data, daysToShow, epochDuration, plotType = 'double') {
        if (!data || data.length === 0) return [];

        // Get date range
        // For double plot, we need to ensure we have enough days generated
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - daysToShow + 1);
        startDate.setHours(0, 0, 0, 0);

        // Create grid structure
        const grid = [];
        const epochsPerDay = (24 * 60) / epochDuration;

        for (let day = 0; day < daysToShow; day++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + day);

            const dayData = {
                date: this.formatDate(currentDate),
                epochs: []
            };

            // 1. Generate first 24 hours (Day N)
            const day1Epochs = this.generateDayEpochs(data, currentDate, epochDuration, 0);
            dayData.epochs.push(...day1Epochs);

            // 2. If double plot, generate next 24 hours (Day N+1)
            if (plotType === 'double') {
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);

                // Offset hours by 24 for the second half
                const day2Epochs = this.generateDayEpochs(data, nextDate, epochDuration, 24);
                dayData.epochs.push(...day2Epochs);
            }

            grid.push(dayData);
        }

        return grid;
    }

    /**
     * Helper to generate epochs for a single day
     */
    generateDayEpochs(data, date, epochDuration, hourOffset = 0) {
        const epochs = [];
        const epochsPerDay = (24 * 60) / epochDuration;

        // Ensure we're working with start of day
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        for (let epochIndex = 0; epochIndex < epochsPerDay; epochIndex++) {
            const epochTime = new Date(startOfDay);
            const minutesFromMidnight = epochIndex * epochDuration;
            epochTime.setMinutes(minutesFromMidnight);

            // Find matching data point
            // We use a wider window (epochDuration) to catch data
            const dataPoint = data.find(d => {
                const dataTime = new Date(d.timestamp);
                return Math.abs(dataTime - epochTime) < (epochDuration * 60 * 1000 / 2); // Closer match
            });

            epochs.push({
                hour: (minutesFromMidnight / 60) + hourOffset,
                time: epochTime,
                activityScore: dataPoint ? dataPoint.activityScore : 0,
                hasData: !!dataPoint
            });
        }

        return epochs;
    }

    /**
     * Show tooltip on hover
     */
    showTooltip(event, epoch) {
        const tooltip = d3.select('#tooltip');

        const dateStr = epoch.time.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const timeStr = epoch.time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const content = epoch.hasData
            ? `<strong>${dateStr} ${timeStr}</strong><br/>Activity: ${epoch.activityScore}%`
            : `<strong>${dateStr} ${timeStr}</strong><br/>No data`;

        tooltip
            .html(content)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .classed('visible', true);
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        d3.select('#tooltip').classed('visible', false);
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        const g = this.config.svg.append('g')
            .attr('class', 'empty-state')
            .attr('transform', `translate(${this.config.width / 2}, 100)`);

        g.append('text')
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('fill', '#999')
            .text('No activity data yet');

        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', 30)
            .style('font-size', '14px')
            .style('fill', '#bbb')
            .text('Start using your browser to collect data');
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
}

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActigramChart;
}
