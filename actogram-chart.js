/**
 * Actogram Chart using D3.js
 * Renders activity data as a heatmap-style actogram
 */

class ActogramChart {
    // Color thresholds for activity levels
    static colorThresholds = [0, 20, 40, 60, 80, 100];
    static colors = ['#E3F2FD', '#90CAF9', '#42A5F5', '#1E88E5', '#1565C0'];

    /**
     * Create a new ActogramChart instance
     * @param {string} containerId - CSS selector for the SVG element
     * @param {number} width - Optional width override
     */
    constructor(containerId, width = null) {
        // Chart configuration
        this.config = {
            margin: { top: 100, right: 60, bottom: 40, left: 80 },
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
            .range(ActogramChart.colors);
    }

    /**
     * Render the actogram chart
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} plotType - 'single' or 'double' (for linear view)
     * @param {string} viewType - 'linear' or 'spiral'
     */
    render(data, daysToShow = 2, epochDuration = 15, plotType = 'double', viewType = 'linear') {
        if (!this.config.svg) {
            console.error('Chart not initialized');
            return;
        }

        // Clear existing chart
        this.config.svg.selectAll('*').remove();

        // Check if we have data
        if (!data || data.length === 0) {
            this.renderEmptyState(viewType);
            return;
        }

        // Route to appropriate render method
        if (viewType === 'spiral') {
            this.renderSpiral(data, daysToShow, epochDuration);
        } else {
            this.renderLinear(data, daysToShow, epochDuration, plotType);
        }
    }

    /**
     * Render linear actogram chart
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} plotType - 'single' or 'double'
     */
    renderLinear(data, daysToShow, epochDuration, plotType) {
        // Process data into grid format
        const gridData = this.processDataToGrid(data, daysToShow, epochDuration, plotType);

        if (gridData.length === 0) {
            this.renderEmptyState('linear');
            return;
        }

        // Calculate dimensions
        const hoursPerRow = plotType === 'double' ? 48 : 24;
        const epochsPerRow = (hoursPerRow * 60) / epochDuration;
        const cellWidth = this.config.width / epochsPerRow;

        // Calculate ideal cellHeight so that height = width of one hour
        // For a 15-min epoch: cellHeight = cellWidth * 4 (4 epochs per hour)
        const idealCellHeight = cellWidth * (60 / epochDuration);

        // Calculate constrained cellHeight for A4 fit (Portrait)
        // A4 Aspect Ratio = 297mm / 210mm ≈ 1.414
        const A4_ASPECT_RATIO = 1.414;
        const maxTotalHeight = this.config.width * A4_ASPECT_RATIO;
        const constrainedCellHeight = maxTotalHeight / gridData.length;

        // Use the smaller of the two heights to ensure it fits on A4 but doesn't get too tall
        // But don't let it get too small (e.g. < 1px) unless absolutely necessary
        const cellHeight = Math.max(0.5, Math.min(idealCellHeight, constrainedCellHeight));

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

        // Add Chart Title
        const startDate = new Date(d3.min(data, d => d.timestamp));
        const endDate = new Date(d3.max(data, d => d.timestamp));
        const dateRangeStr = `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;

        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -85)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .style('fill', '#333')
            .text('Online Actogram');

        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .style('font-size', '13px')
            .style('fill', '#666')
            .text(`${dateRangeStr} • ${epochDuration} min epochs`);

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

        // Smart tick values for large date ranges
        if (gridData.length > 14) {
            const tickValues = gridData
                .filter(d => {
                    const date = d.rawDate;
                    if (gridData.length > 180) {
                        // For > 6 months, show 1st of month
                        return date.getDate() === 1;
                    } else if (gridData.length > 60) {
                        // For 2-6 months, show 1st and 15th
                        return date.getDate() === 1 || date.getDate() === 15;
                    } else {
                        // For 2 weeks - 2 months, show Mondays
                        return date.getDay() === 1;
                    }
                })
                .map(d => d.date);

            // Ensure we have at least some ticks, if filter is too aggressive
            if (tickValues.length > 0) {
                yAxis.tickValues(tickValues);
            }
        }

        g.append('g')
            .attr('class', 'axis y-axis')
            .call(yAxis);

        // Add axis labels
        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -35)
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
                    .attr('tabindex', '0')
                    .attr('role', 'graphics-symbol')
                    .attr('aria-label', (d) => {
                        const dateStr = epoch.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const timeStr = epoch.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        return `${dateStr} ${timeStr}, Activity: ${epoch.hasData ? epoch.activityScore + '%' : 'No data'}`;
                    })
                    .on('mouseover', (event) => this.showTooltip(event, epoch))
                    .on('mouseout', () => this.hideTooltip())
                    .on('focus', (event) => this.showTooltip(event, epoch))
                    .on('blur', () => this.hideTooltip())
                    .on('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            this.showTooltip(event, epoch);
                        }
                    });
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
     * Render spiral (circular) actogram chart
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display (max 90)
     * @param {number} epochDuration - Duration of each epoch in minutes
     */
    renderSpiral(data, daysToShow, epochDuration) {
        // Cap at 90 days for spiral view
        const MAX_SPIRAL_DAYS = 90;
        const effectiveDays = Math.min(daysToShow, MAX_SPIRAL_DAYS);

        // Spiral configuration
        const baseRadius = 40;
        const radialStep = 15;
        const arcThickness = 10;
        const epochAngleWidth = (epochDuration / 1440) * 2 * Math.PI;

        // Calculate dimensions and dynamic scaling
        const maxRadius = baseRadius + (effectiveDays * radialStep);
        const visualRadius = maxRadius + 40; // Account for time labels
        const diameter = visualRadius * 2;

        // Calculate SVG size to maintain constant padding ratio
        // We want ~200px of padding (100px top/bottom) on a standard 800px wide chart
        // This ensures the title (at y=50, y=80) fits in the top margin
        const targetPaddingRatio = 200 / 800; // 0.25
        const contentRatio = 1 - targetPaddingRatio; // 0.75

        const svgSize = diameter / contentRatio;
        const scaleFactor = svgSize / 800; // No Math.max clamp!

        const titleFontSize = 18 * scaleFactor;
        const subtitleFontSize = 13 * scaleFactor;

        const centerX = svgSize / 2;
        const centerY = svgSize / 2;

        // Set SVG dimensions
        this.config.svg
            .attr('viewBox', `0 0 ${svgSize} ${svgSize}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('width', '100%')
            .style('height', 'auto');

        // Add Chart Title (Spiral)
        const startDate = new Date(d3.min(data, d => d.timestamp));
        const endDate = new Date(d3.max(data, d => d.timestamp));
        const dateRangeStr = `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;

        this.config.svg.append('text')
            .attr('x', centerX)
            .attr('y', 50 * scaleFactor)
            .attr('text-anchor', 'middle')
            .style('font-size', `${titleFontSize}px`)
            .style('font-weight', 'bold')
            .style('fill', '#333')
            .text('Online Actogram');

        this.config.svg.append('text')
            .attr('x', centerX)
            .attr('y', 80 * scaleFactor)
            .attr('text-anchor', 'middle')
            .style('font-size', `${subtitleFontSize}px`)
            .style('fill', '#666')
            .text(`${dateRangeStr} • ${epochDuration} min epochs`);

        // Create main group
        const g = this.config.svg.append('g')
            .attr('transform', `translate(${centerX},${centerY})`);

        // Process data into spiral format
        const spiralData = this.processDataToSpiral(data, effectiveDays, epochDuration);

        // Draw activity arcs
        spiralData.forEach(({ dayIndex, minutesSinceMidnight, activityScore, hasData, timestamp }) => {
            if (!hasData || activityScore === 0) return; // Skip empty epochs

            const angle = (minutesSinceMidnight / 1440) * 2 * Math.PI; // 0 is top (12 o'clock) in d3.arc
            const radius = baseRadius + (dayIndex * radialStep);

            const arc = d3.arc()
                .innerRadius(radius - arcThickness / 2)
                .outerRadius(radius + arcThickness / 2)
                .startAngle(angle - epochAngleWidth / 2)
                .endAngle(angle + epochAngleWidth / 2);

            const fillColor = this.config.colorScale(activityScore);

            g.append('path')
                .attr('d', arc)
                .attr('d', arc)
                .attr('fill', fillColor)
                .attr('stroke', 'none')
                .attr('tabindex', '0')
                .attr('role', 'graphics-symbol')
                .attr('aria-label', (d) => {
                    const dateStr = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    return `${dateStr} ${timeStr}, Activity: ${hasData ? activityScore + '%' : 'No data'}`;
                })
                .on('mouseover', (event) => this.showTooltip(event, { time: new Date(timestamp), activityScore, hasData }))
                .on('mouseout', () => this.hideTooltip())
                .on('focus', (event) => this.showTooltip(event, { time: new Date(timestamp), activityScore, hasData }))
                .on('blur', () => this.hideTooltip())
                .on('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.showTooltip(event, { time: new Date(timestamp), activityScore, hasData });
                    }
                });
        });

        // Draw faint grid circles for each day (optional)
        for (let day = 0; day <= effectiveDays; day++) {
            const radius = baseRadius + (day * radialStep);
            g.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', radius)
                .attr('fill', 'none')
                .attr('stroke', '#f0f0f0')
                .attr('stroke-width', 0.5);
        }

        // Draw radial grid lines for major time markers (midnight, 6am, noon, 6pm)
        [0, 6, 12, 18].forEach(hour => {
            const angle = ((hour / 24) * 2 * Math.PI) - (Math.PI / 2);
            const x2 = Math.cos(angle) * maxRadius;
            const y2 = Math.sin(angle) * maxRadius;

            g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', '#e0e0e0')
                .attr('stroke-width', 0.5)
                .attr('stroke-dasharray', '2,2');

            // Add time labels
            const labelRadius = maxRadius + 20;
            const labelX = Math.cos(angle) * labelRadius;
            const labelY = Math.sin(angle) * labelRadius;

            g.append('text')
                .attr('x', labelX)
                .attr('y', labelY)
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('font-size', '10px')
                .style('fill', '#999')
                .text(`${hour}:00`);
        });
    }

    /**
     * Process data into spiral format
     */
    processDataToSpiral(data, daysToShow, epochDuration) {
        const spiralData = [];

        if (!data || data.length === 0) return spiralData;

        // Get actual date range from data
        const dataStart = new Date(Math.min(...data.map(d => d.timestamp)));
        const dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));

        // Cap at 90 days for spiral view
        const MAX_SPIRAL_DAYS = 90;
        let effectiveDays;

        if (daysToShow === 'all') {
            // For spiral view, limit to MAX_SPIRAL_DAYS even for "all"
            const totalDays = Math.ceil((dataEnd - dataStart) / (1000 * 60 * 60 * 24));
            effectiveDays = Math.min(totalDays, MAX_SPIRAL_DAYS);
        } else {
            effectiveDays = Math.min(daysToShow, MAX_SPIRAL_DAYS);
        }

        // Get date range for display
        const endDate = new Date(dataEnd);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - effectiveDays + 1);
        startDate.setHours(0, 0, 0, 0);

        const epochsPerDay = (24 * 60) / epochDuration;

        for (let dayIndex = 0; dayIndex < effectiveDays; dayIndex++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + dayIndex);
            currentDate.setHours(0, 0, 0, 0);

            for (let epochIndex = 0; epochIndex < epochsPerDay; epochIndex++) {
                const epochTime = new Date(currentDate);
                const minutesFromMidnight = epochIndex * epochDuration;
                epochTime.setMinutes(minutesFromMidnight);

                // Find matching data point
                const dataPoint = data.find(d => {
                    const dataTime = new Date(d.timestamp);
                    return Math.abs(dataTime - epochTime) < (epochDuration * 60 * 1000 / 2);
                });

                spiralData.push({
                    dayIndex,
                    minutesSinceMidnight: minutesFromMidnight,
                    activityScore: dataPoint ? dataPoint.activityScore : 0,
                    hasData: !!dataPoint,
                    timestamp: epochTime.getTime()
                });
            }
        }

        return spiralData;
    }

    /**
     * Process raw data into grid format
     */
    processDataToGrid(data, daysToShow, epochDuration, plotType = 'double') {
        if (!data || data.length === 0) return [];

        // Get actual date range from data
        const dataStart = new Date(Math.min(...data.map(d => d.timestamp)));
        const dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));

        // For "daysToShow" functionality, we need to determine the actual range
        // If daysToShow is a specific number, we show that many days ending with dataEnd
        // If daysToShow is 'all', we show all data
        let startDate, endDate;

        if (daysToShow === 'all') {
            startDate = new Date(dataStart);
            endDate = new Date(dataEnd);
        } else {
            // Show the specified number of days ending with dataEnd
            endDate = new Date(dataEnd);
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - daysToShow + 1);
        }

        // Ensure we're working with start/end of days
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Create grid structure for the actual date range in data
        const grid = [];
        const timeDiff = endDate - startDate;
        const daysInRange = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

        const epochsPerDay = (24 * 60) / epochDuration;

        for (let day = 0; day < daysInRange; day++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + day);

            const dayData = {
                date: this.formatDate(currentDate),
                rawDate: new Date(currentDate),
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

        // Handle keyboard events (where pageX/Y might be missing)
        let x = event.pageX;
        let y = event.pageY;

        if (x === undefined || x === 0) {
            // Position relative to the target element
            const rect = event.target.getBoundingClientRect();
            x = rect.left + window.scrollX + (rect.width / 2);
            y = rect.top + window.scrollY;
        }

        tooltip
            .html(content)
            .style('left', (x + 10) + 'px')
            .style('top', (y - 10) + 'px')
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
     * @param {string} viewType - 'linear' or 'spiral'
     */
    renderEmptyState(viewType = 'linear') {
        if (viewType === 'spiral') {
            // Draw empty spiral with grid circle
            const baseRadius = 40;
            const g = this.config.svg.append('g')
                .attr('class', 'empty-state')
                .attr('transform', `translate(${this.config.width / 2}, ${this.config.width / 2})`);

            // Draw a faint circle to show where spiral would be
            g.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', baseRadius)
                .attr('fill', 'none')
                .attr('stroke', '#ddd')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,2');

            // Center text
            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('font-size', '16px')
                .style('fill', '#999')
                .text('No activity data yet');

            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '2em')
                .style('font-size', '14px')
                .style('fill', '#bbb')
                .text('Start using your browser to collect data');
        } else {
            // Linear empty state
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
    module.exports = ActogramChart;
}
