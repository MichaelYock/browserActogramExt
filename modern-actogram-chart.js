/**
 * Modern Actogram Chart using D3.js
 * Enhanced visualization with improved performance and interactions
 */

class ModernActogramChart {
    // Enhanced color thresholds for activity levels
    static colorThresholds = [0, 20, 40, 60, 80, 100];
    static colors = ['#E3F2FD', '#90CAF9', '#42A5F5', '#1E88E5', '#1565C0'];

    /**
     * Create a new ModernActogramChart instance
     * @param {string} containerId - CSS selector for the SVG element
     * @param {number} width - Optional width override
     */
    constructor(containerId, width = null) {
        // Enhanced chart configuration
        this.config = {
            margin: { top: 80, right: 40, bottom: 40, left: 60 },
            cellHeight: 25,
            cellPadding: 0.5,
            colorScale: null,
            svg: null,
            width: 0,
            height: 0
        };

        this.config.svg = d3.select(containerId);

        // Debug: Check if SVG element was found
        if (this.config.svg.empty()) {
            console.error('SVG element not found for selector:', containerId);
        } else {
            console.log('SVG element found for selector:', containerId);
        }

        // Get width from container if not specified
        if (!width) {
            const container = document.querySelector(containerId);
            if (container) {
                width = container.parentElement.clientWidth - 20; // Account for padding
            } else {
                width = 700; // Fallback
            }
        }

        // Store the original width to restore it when switching views
        this.originalWidth = width - this.config.margin.left - this.config.margin.right;
        this.config.width = this.originalWidth;

        // Create enhanced color scale
        this.config.colorScale = d3.scaleThreshold()
            .domain([20, 40, 60, 80])
            .range(ModernActogramChart.colors);
    }

    /**
     * Render the enhanced actogram chart
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} viewType - 'linear', 'spiral', or 'heatmap'
     * @param {string} plotType - 'single' or 'double' (for linear view)
     */
    render(data, daysToShow = 7, epochDuration = 15, viewType = 'linear', plotType = 'double') {
        console.log('Rendering chart with data:', data, 'daysToShow:', daysToShow, 'epochDuration:', epochDuration, 'viewType:', viewType);

        if (!this.config.svg) {
            console.error('Chart not initialized');
            return;
        }

        // Debug: Check if SVG element is still valid
        if (this.config.svg.empty()) {
            console.error('SVG element is no longer valid');
            return;
        }

        // Show loading indicator
        this.showLoading(true);

        // Use setTimeout to allow UI to update before heavy processing
        setTimeout(() => {
            try {
                // Clear existing chart
                this.config.svg.selectAll('*').remove();

                // Check if we have data
                if (!data || data.length === 0) {
                    console.log('No data to render, showing empty state');
                    this.renderEmptyState(viewType);
                    this.showLoading(false);
                    return;
                }

                // Route to appropriate render method
                switch (viewType) {
                    case 'spiral':
                        console.log('Rendering spiral view');
                        this.renderSpiral(data, daysToShow, epochDuration);
                        break;
                    case 'heatmap':
                        console.log('Rendering heatmap view');
                        this.renderHeatmap(data, daysToShow, epochDuration);
                        break;
                    default:
                        console.log('Rendering linear view with plotType:', plotType);
                        this.renderLinear(data, daysToShow, epochDuration, plotType);
                }
            } catch (error) {
                console.error('Error rendering chart:', error);
                this.renderErrorState();
            } finally {
                this.showLoading(false);
            }
        }, 50);
    }

    /**
     * Show/hide loading indicator
     */
    showLoading(show) {
        const overlay = d3.select('.chart-overlay');
        if (overlay.empty()) return;
        
        overlay.style('display', show ? 'flex' : 'none');
    }

    /**
     * Render linear actogram chart with enhanced features
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} plotType - 'single' or 'double'
     */
    renderLinear(data, daysToShow, epochDuration, plotType = 'double') {
        console.log('Starting renderLinear with data length:', data ? data.length : 0, 'plotType:', plotType);

        // Restore original width for linear view
        this.config.width = this.originalWidth;

        // Process data into grid format with optimized lookup
        const gridData = this.processDataToGrid(data, daysToShow, epochDuration, plotType);
        console.log('Processed gridData length:', gridData.length);

        if (gridData.length === 0) {
            this.renderEmptyState('linear');
            return;
        }

        // Calculate dimensions
        const hoursPerRow = plotType === 'double' ? 48 : 24; // Double plot shows 48 hours
        const epochsPerRow = (hoursPerRow * 60) / epochDuration;
        const cellWidth = this.config.width / epochsPerRow;

        // Calculate cell height to make epochs square by default
        // For 15-min epochs: height = 4 * width (since there are 4 epochs per hour)
        const defaultCellHeight = cellWidth * (60 / epochDuration);

        // Calculate A4 aspect ratio constraints
        const A4_ASPECT_RATIO = Math.sqrt(2); // A4 ratio is 1:sqrt(2) ≈ 1:1.414
        const maxChartHeight = this.config.width * A4_ASPECT_RATIO;

        // Calculate height needed for current data
        let cellHeight = defaultCellHeight;
        let chartHeight = gridData.length * cellHeight;

        // If chart would exceed A4 height, scale down proportionally
        if (chartHeight > maxChartHeight && gridData.length > 14) { // Only adjust for longer date ranges
            cellHeight = maxChartHeight / gridData.length;
            // Set minimum height to ensure visibility
            cellHeight = Math.max(3, cellHeight);
        }

        // Set maximum height for very short date ranges to prevent overly tall cells
        if (gridData.length <= 14) {
            cellHeight = Math.min(cellHeight, 30);
        }

        this.config.cellHeight = cellHeight;
        this.config.height = gridData.length * cellHeight;

        // Set SVG dimensions
        const totalWidth = this.config.width + this.config.margin.left + this.config.margin.right;
        const totalHeight = this.config.height + this.config.margin.top + this.config.margin.bottom;

        this.config.svg
            .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .style('width', '100%')
            .style('height', '100%')
            .style('min-height', `${totalHeight}px`);

        // Create main group
        const g = this.config.svg.append('g')
            .attr('transform', `translate(${this.config.margin.left},${this.config.margin.top})`)
            .style('opacity', 1);  // Set to 1 immediately instead of fading in

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, hoursPerRow])
            .range([0, this.config.width]);

        const yScale = d3.scaleBand()
            .domain(gridData.map(d => d.date))
            .range([0, this.config.height])
            .padding(0);  // Remove padding between rows

        // Add Chart Title with enhanced styling
        const startDate = new Date(d3.min(data, d => d.timestamp));
        const endDate = new Date(d3.max(data, d => d.timestamp));
        const dateRangeStr = `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;

        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', '600')
            .style('fill', '#1565C0')
            .text('Browser Activity Pattern');

        g.append('text')
            .attr('x', this.config.width / 2)
            .attr('y', -35)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#666')
            .text(`${dateRangeStr} • ${epochDuration} min epochs`);

        // Enhanced X axis with better time markers
        const xAxis = d3.axisTop(xScale)
            .ticks(6)
            .tickValues(plotType === 'double' ?
                [...d3.range(0, 25, 6), ...d3.range(24, 49, 6)]  // 0-24 and 24-48 for double plot (every 6 hours)
                : d3.range(0, 25, 6))  // 0-24 for single plot (every 6 hours)
            .tickFormat(d => {
                const h = d % 24;
                return `${Math.floor(h)}:00`;
            });

        const xAxisGroup = g.append('g')
            .attr('class', 'axis x-axis')
            .call(xAxis);

        xAxisGroup.selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'start')
            .style('font-size', '10px');

        // Enhanced Y axis with smart date formatting
        const yAxis = d3.axisLeft(yScale);
        
        // Smart tick values for large date ranges
        if (gridData.length > 14) {
            const tickValues = gridData
                .filter(d => {
                    const date = d.rawDate;
                    if (gridData.length > 60) {
                        // For > 2 months, show 1st of month
                        return date.getDate() === 1;
                    } else if (gridData.length > 30) {
                        // For 1-2 months, show 1st and 15th
                        return date.getDate() === 1 || date.getDate() === 15;
                    } else {
                        // For 2 weeks - 1 month, show Mondays
                        return date.getDay() === 1;
                    }
                })
                .map(d => d.date);

            if (tickValues.length > 0) {
                yAxis.tickValues(tickValues);
            }
        }

        const yAxisGroup = g.append('g')
            .attr('class', 'axis y-axis')
            .call(yAxis);

        yAxisGroup.selectAll('text')
            .style('font-size', '11px');

        // Add axis labels
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.config.height / 2)
            .attr('y', -45)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('fill', '#666')
            .text('Date');

        // Draw cells with enhanced interactions
        const cells = g.selectAll('.activity-row')
            .data(gridData)
            .enter()
            .append('g')
            .attr('class', 'activity-row')
            .attr('transform', (d, i) => `translate(0, ${i * this.config.cellHeight})`)
            .selectAll('.activity-cell')
            .data(d => d.epochs)
            .enter()
            .append('rect')
            .attr('class', 'activity-cell')
            .attr('x', d => xScale(d.hour))
            .attr('y', 0)
            .attr('width', cellWidth)  // Remove padding
            .attr('height', this.config.cellHeight)  // Remove padding
            .attr('fill', d => {
                if (!d.hasData || d.activityScore === 0) {
                    return '#ffffff';
                }
                return this.config.colorScale(d.activityScore);
            })
            // Remove stroke/border to eliminate gaps between cells
            .attr('rx', 0)  // Remove rounded corners
            .attr('ry', 0)  // Remove rounded corners
            .attr('tabindex', '0')
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => {
                const dateStr = d.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const timeStr = d.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                return `${dateStr} ${timeStr}, Activity: ${d.hasData ? d.activityScore + '%' : 'No data'}`;
            })
            .on('mouseover', (event, d) => this.showEnhancedTooltip(event, d))
            .on('mouseout', () => this.hideTooltip())
            .on('focus', (event, d) => this.showEnhancedTooltip(event, d))
            .on('blur', () => this.hideTooltip())
            .attr('keydown', (event, d) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.showEnhancedTooltip(event, d);
                }
            });

        // Set cell opacity immediately instead of animating
        cells.style('opacity', 1);
    }

    /**
     * Render spiral (circular) actogram chart
     */
    renderSpiral(data, daysToShow, epochDuration) {
        // Cap at 90 days for spiral view
        const MAX_SPIRAL_DAYS = 90;
        const effectiveDays = Math.min(daysToShow === 'all' ? 90 : daysToShow, MAX_SPIRAL_DAYS);

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
        const targetPaddingRatio = 200 / 800; // 0.25
        const contentRatio = 1 - targetPaddingRatio; // 0.75

        const svgSize = diameter / contentRatio;
        const scaleFactor = svgSize / 800;

        const titleFontSize = 18 * scaleFactor;
        const subtitleFontSize = 13 * scaleFactor;

        const centerX = svgSize / 2;
        const centerY = svgSize / 2;

        // Set SVG dimensions
        this.config.svg
            .attr('viewBox', `0 0 ${svgSize} ${svgSize}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .style('width', '100%')
            .style('height', '100%')
            .style('min-height', `${svgSize}px`);

        // Add Chart Title (Spiral)
        const startDate = new Date(Math.min(...data.map(d => d.timestamp)));
        const endDate = new Date(Math.max(...data.map(d => d.timestamp)));
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

        // Create main group centered in the viewBox
        const g = this.config.svg.append('g')
            .attr('transform', `translate(${centerX},${centerY})`);

        // Pre-process data into a map for O(1) lookups
        const epochDurationMs = epochDuration * 60 * 1000;
        const dataMap = new Map();
        
        for (const dataPoint of data) {
            const normalizedTime = Math.floor(dataPoint.timestamp / (epochDurationMs / 2)) * (epochDurationMs / 2);
            dataMap.set(normalizedTime, dataPoint);
        }

        const epochsPerDay = (24 * 60) / epochDuration;

        // Draw activity arcs
        for (let dayIndex = 0; dayIndex < effectiveDays; dayIndex++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + dayIndex);
            currentDate.setHours(0, 0, 0, 0);

            for (let epochIndex = 0; epochIndex < epochsPerDay; epochIndex++) {
                const epochTime = new Date(currentDate);
                const minutesFromMidnight = epochIndex * epochDuration;
                epochTime.setMinutes(minutesFromMidnight);

                // Find matching data point using pre-indexed map - O(1) lookup
                const normalizedTime = Math.floor(epochTime.getTime() / (epochDurationMs / 2)) * (epochDurationMs / 2);
                const dataPoint = dataMap.get(normalizedTime);

                if (!dataPoint || dataPoint.activityScore === 0) continue; // Skip empty epochs

                const angle = (minutesFromMidnight / 1440) * 2 * Math.PI;
                const radius = baseRadius + (dayIndex * radialStep);

                const arc = d3.arc()
                    .innerRadius(radius - arcThickness / 2)
                    .outerRadius(radius + arcThickness / 2)
                    .startAngle(angle - epochAngleWidth / 2)
                    .endAngle(angle + epochAngleWidth / 2);

                const fillColor = this.config.colorScale(dataPoint.activityScore);

                g.append('path')
                    .attr('d', arc)
                    .attr('fill', fillColor)
                    .attr('stroke', 'none')
                    .attr('tabindex', '0')
                    .attr('role', 'graphics-symbol')
                    .attr('aria-label', (d) => {
                        const dateStr = epochTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const timeStr = epochTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        return `${dateStr} ${timeStr}, Activity: ${dataPoint.activityScore}%`;
                    })
                    .on('mouseover', (event) => this.showTooltip(event, { time: epochTime, activityScore: dataPoint.activityScore, hasData: true }))
                    .on('mouseout', () => this.hideTooltip())
                    .on('focus', (event) => this.showTooltip(event, { time: epochTime, activityScore: dataPoint.activityScore, hasData: true }))
                    .on('blur', () => this.hideTooltip())
                    .on('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            this.showTooltip(event, { time: epochTime, activityScore: dataPoint.activityScore, hasData: true });
                        }
                    });
            }
        }

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
     * Render heatmap view
     */
    renderHeatmap(data, daysToShow, epochDuration) {
        // Process data for aggregated heatmap (by day of week)
        const heatmapData = this.processDataForAggregatedHeatmap(data, epochDuration);

        if (heatmapData.length === 0) {
            this.renderEmptyState('heatmap');
            return;
        }

        // Calculate dimensions
        // For heatmap, we want square cells by default
        const defaultCellSize = Math.max(10, this.config.width / 24);

        // Calculate A4 aspect ratio constraints
        const A4_ASPECT_RATIO = Math.sqrt(2); // A4 ratio is 1:sqrt(2) ≈ 1:1.414
        const maxChartHeight = this.config.width * A4_ASPECT_RATIO;

        // Calculate height needed for current data (7 days of week)
        let cellSize = defaultCellSize;
        let chartHeight = heatmapData.length * cellSize;

        // If chart would exceed A4 height, scale down proportionally
        if (chartHeight > maxChartHeight && heatmapData.length > 7) { // Only adjust for longer date ranges
            cellSize = maxChartHeight / heatmapData.length;
            // Set minimum size to ensure visibility
            cellSize = Math.max(3, cellSize);
        }

        // Set maximum size for very short date ranges to prevent overly large cells
        if (heatmapData.length <= 7) {
            cellSize = Math.min(cellSize, 30);
        }

        const heatmapChartWidth = cellSize * 24;
        const heatmapChartHeight = cellSize * heatmapData.length;

        this.config.width = heatmapChartWidth;
        this.config.height = heatmapChartHeight;

        // Set SVG dimensions
        const svgWidth = heatmapChartWidth + this.config.margin.left + this.config.margin.right;
        const svgHeight = heatmapChartHeight + this.config.margin.top + this.config.margin.bottom;

        this.config.svg
            .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .style('width', '100%')
            .style('height', '100%')
            .style('min-height', `${svgHeight}px`);

        // Create main group
        const g = this.config.svg.append('g')
            .attr('transform', `translate(${this.config.margin.left},${this.config.margin.top})`)
            .style('opacity', 1);  // Set to 1 immediately instead of fading in

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, 24])
            .range([0, heatmapChartWidth]);

        const yScale = d3.scaleBand()
            .domain(heatmapData.map(d => d.day))
            .range([0, heatmapChartHeight])
            .padding(0);  // Remove padding between rows

        // Add Chart Title
        g.append('text')
            .attr('x', heatmapChartWidth / 2)
            .attr('y', -40)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', '600')
            .style('fill', '#1565C0')
            .text('Activity Heatmap');

        // Draw heatmap cells
        heatmapData.forEach((dayData, dayIndex) => {
            dayData.hours.forEach((hourData, hourIndex) => {
                const x = xScale(hourIndex);
                const y = yScale(dayData.day);

                g.append('rect')
                    .attr('class', 'heatmap-cell')
                    .attr('x', x)
                    .attr('y', y)
                    .attr('width', cellSize)  // Remove padding
                    .attr('height', yScale.bandwidth())  // Remove padding
                    .attr('fill', hourData.hasData ? this.config.colorScale(hourData.activityScore) : '#ffffff')
                    // Remove stroke/border to eliminate gaps between cells
                    .attr('rx', 0)  // Remove rounded corners
                    .attr('ry', 0)  // Remove rounded corners
                    .attr('tabindex', '0')
                    .on('mouseover', (event) => this.showHeatmapTooltip(event, hourData, dayData.day, hourIndex))
                    .on('mouseout', () => this.hideTooltip())
                    .on('focus', (event) => this.showHeatmapTooltip(event, hourData, dayData.day, hourIndex))
                    .on('blur', () => this.hideTooltip());
            });
        });

        // Add time labels
        const timeLabels = g.append('g')
            .attr('class', 'time-labels');

        for (let i = 0; i < 24; i += 2) {
            timeLabels.append('text')
                .attr('x', xScale(i) + cellSize / 2)
                .attr('y', -10)
                .attr('text-anchor', 'middle')
                .style('font-size', '10px')
                .style('fill', '#666')
                .text(`${i}:00`);
        }

        // Add day labels
        const dayLabels = g.append('g')
            .attr('class', 'day-labels');

        heatmapData.forEach((dayData, index) => {
            dayLabels.append('text')
                .attr('x', -10)
                .attr('y', yScale(dayData.day) + yScale.bandwidth() / 2)
                .attr('text-anchor', 'end')
                .attr('dy', '0.35em')
                .style('font-size', '10px')
                .style('fill', '#666')
                .text(dayData.day.substring(0, 3));
        });
    }

    /**
     * Process data for heatmap view
     */
    processDataForHeatmap(data, daysToShow, epochDuration) {
        if (!data || data.length === 0) return [];

        // Get date range
        let dataEnd, dataStart;
        if (daysToShow === 'all') {
            dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));
            dataStart = new Date(Math.min(...data.map(d => d.timestamp)));
        } else {
            dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));
            dataStart = new Date(dataEnd);
            dataStart.setDate(dataStart.getDate() - daysToShow + 1);
        }
        dataStart.setHours(0, 0, 0, 0);

        // Pre-process data into a map for O(1) lookups
        const epochDurationMs = epochDuration * 60 * 1000;
        const dataMap = new Map();
        
        for (const dataPoint of data) {
            const normalizedTime = Math.floor(dataPoint.timestamp / (epochDurationMs / 2)) * (epochDurationMs / 2);
            dataMap.set(normalizedTime, dataPoint);
        }

        const daysToProcess = daysToShow === 'all' ? 
            Math.ceil((dataEnd - dataStart) / (1000 * 60 * 60 * 24)) : 
            daysToShow;
        
        const heatmapData = [];

        for (let day = 0; day < daysToProcess; day++) {
            const currentDate = new Date(dataStart);
            currentDate.setDate(currentDate.getDate() + day);
            
            const hours = [];
            for (let hour = 0; hour < 24; hour++) {
                const epochTime = new Date(currentDate);
                epochTime.setHours(hour, 0, 0, 0);
                
                // Find matching data point
                const normalizedTime = Math.floor(epochTime.getTime() / (epochDurationMs / 2)) * (epochDurationMs / 2);
                const dataPoint = dataMap.get(normalizedTime);
                
                hours.push({
                    hour,
                    time: epochTime,
                    activityScore: dataPoint ? dataPoint.activityScore : 0,
                    hasData: !!dataPoint
                });
            }
            
            heatmapData.push({
                day: this.formatDate(currentDate),
                hours
            });
        }

        return heatmapData;
    }

    /**
     * Process raw data into aggregated heatmap format by day of week
     * @param {Array} data - Activity data array
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @returns {Array} Aggregated heatmap data grouped by day of week
     */
    processDataForAggregatedHeatmap(data, epochDuration) {
        if (!data || data.length === 0) return [];

        // Pre-process data into a map for O(1) lookups
        const epochDurationMs = epochDuration * 60 * 1000;
        const dataMap = new Map();

        for (const dataPoint of data) {
            const normalizedTime = Math.floor(dataPoint.timestamp / (epochDurationMs / 2)) * (epochDurationMs / 2);
            dataMap.set(normalizedTime, dataPoint);
        }

        // Create array for days of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        // We want Monday-Sunday order, so we'll reorder: [1,2,3,4,5,6,0]
        const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday to Sunday
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        // Initialize data structure to hold aggregated values
        const aggregatedData = dayOrder.map((dayIndex, index) => ({
            dayIndex: dayIndex,
            day: dayNames[index],
            hours: Array(24).fill(null).map((_, hour) => ({
                hour: hour,
                values: [] // Will store all values for this hour across all occurrences of this day
            }))
        }));

        // Process all data points and group by day of week and hour
        const dataStart = new Date(Math.min(...data.map(d => d.timestamp)));
        const dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));
        dataStart.setHours(0, 0, 0, 0);

        const totalDays = Math.ceil((dataEnd - dataStart) / (1000 * 60 * 60 * 24));

        for (let day = 0; day < totalDays; day++) {
            const currentDate = new Date(dataStart);
            currentDate.setDate(currentDate.getDate() + day);

            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            const dayDataIndex = dayOrder.indexOf(dayOfWeek);

            // Skip if this day isn't in our ordered list (shouldn't happen)
            if (dayDataIndex === -1) continue;

            // Process each hour of this day
            for (let hour = 0; hour < 24; hour++) {
                const epochTime = new Date(currentDate);
                epochTime.setHours(hour, 0, 0, 0);

                // Find matching data point
                const normalizedTime = Math.floor(epochTime.getTime() / (epochDurationMs / 2)) * (epochDurationMs / 2);
                const dataPoint = dataMap.get(normalizedTime);

                if (dataPoint) {
                    aggregatedData[dayDataIndex].hours[hour].values.push(dataPoint.activityScore);
                }
            }
        }

        // Calculate averages for each hour of each day
        const heatmapData = aggregatedData.map(dayData => ({
            day: dayData.day,
            hours: dayData.hours.map(hourData => ({
                hour: hourData.hour,
                time: new Date(0), // Placeholder, not used in aggregated view
                activityScore: hourData.values.length > 0
                    ? hourData.values.reduce((sum, val) => sum + val, 0) / hourData.values.length
                    : 0,
                hasData: hourData.values.length > 0
            }))
        }));

        return heatmapData;
    }
    /**
     * Process raw data into grid format
     * @param {Array} data - Activity data array
     * @param {number} daysToShow - Number of days to display
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {string} plotType - 'single' or 'double'
     */
    processDataToGrid(data, daysToShow, epochDuration, plotType = 'double') {
        if (!data || data.length === 0) return [];

        // Get date range
        let dataEnd, dataStart;
        if (daysToShow === 'all') {
            dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));
            dataStart = new Date(Math.min(...data.map(d => d.timestamp)));
        } else {
            dataEnd = new Date(Math.max(...data.map(d => d.timestamp)));
            dataStart = new Date(dataEnd);
            dataStart.setDate(dataStart.getDate() - daysToShow + 1);
        }
        dataStart.setHours(0, 0, 0, 0);

        // Pre-process data into a map for O(1) lookups
        const epochDurationMs = epochDuration * 60 * 1000;
        const dataMap = new Map();

        for (const dataPoint of data) {
            const normalizedTime = Math.floor(dataPoint.timestamp / (epochDurationMs / 2)) * (epochDurationMs / 2);
            dataMap.set(normalizedTime, dataPoint);
        }

        // Create grid structure for the actual date range in data
        const grid = [];
        const timeDiff = dataEnd - dataStart;
        const daysInRange = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

        const epochsPerDay = (24 * 60) / epochDuration;

        for (let day = 0; day < daysInRange; day++) {
            const currentDate = new Date(dataStart);
            currentDate.setDate(currentDate.getDate() + day);

            const dayData = {
                date: this.formatDate(currentDate),
                rawDate: new Date(currentDate),
                epochs: []
            };

            // 1. Generate first 24 hours (Day N)
            const day1Epochs = this.generateDayEpochs(dataMap, currentDate, epochDuration, 0, epochDurationMs);
            dayData.epochs.push(...day1Epochs);

            // 2. If double plot, generate next 24 hours (Day N+1)
            if (plotType === 'double') {
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);

                // Offset hours by 24 for the second half
                const day2Epochs = this.generateDayEpochs(dataMap, nextDate, epochDuration, 24, epochDurationMs);
                dayData.epochs.push(...day2Epochs);
            }

            grid.push(dayData);
        }

        return grid;
    }

    /**
     * Helper to generate epochs for a single day
     * @param {Map} dataMap - Map of timestamp to data points
     * @param {Date} date - Date to generate epochs for
     * @param {number} epochDuration - Duration of each epoch in minutes
     * @param {number} hourOffset - Hour offset for positioning (0 for first day, 24 for second day in double plot)
     * @param {number} epochDurationMs - Epoch duration in milliseconds
     */
    generateDayEpochs(dataMap, date, epochDuration, hourOffset = 0, epochDurationMs) {
        const epochs = [];
        const epochsPerDay = (24 * 60) / epochDuration;

        // Ensure we're working with start of day
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        for (let epochIndex = 0; epochIndex < epochsPerDay; epochIndex++) {
            const epochTime = new Date(startOfDay);
            const minutesFromMidnight = epochIndex * epochDuration;
            epochTime.setMinutes(minutesFromMidnight);

            // Find matching data point using pre-indexed map - O(1) lookup
            const normalizedTime = Math.floor(epochTime.getTime() / (epochDurationMs / 2)) * (epochDurationMs / 2);
            const dataPoint = dataMap.get(normalizedTime);

            epochs.push({
                hour: (minutesFromMidnight / 60) + hourOffset, // Add offset for second day in double plot
                time: epochTime,
                activityScore: dataPoint ? dataPoint.activityScore : 0,
                hasData: !!dataPoint
            });
        }

        return epochs;
    }

    /**
     * Show enhanced tooltip with trend information
     */
    showEnhancedTooltip(event, epoch) {
        const tooltip = d3.select('#tooltip');

        const dateStr = epoch.time.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const timeStr = epoch.time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Enhanced tooltip content with trend analysis
        let content = `<div class="tooltip-header">${dateStr} ${timeStr}</div>`;
        
        if (epoch.hasData) {
            content += `<div class="tooltip-content">Activity: ${epoch.activityScore}%</div>`;
            
            // Add trend indicator based on activity level
            if (epoch.activityScore > 80) {
                content += `<div class="tooltip-content" style="color:#4CAF50">High activity period</div>`;
            } else if (epoch.activityScore > 40) {
                content += `<div class="tooltip-content" style="color:#2196F3">Moderate activity</div>`;
            } else if (epoch.activityScore > 0) {
                content += `<div class="tooltip-content" style="color:#FF9800">Low activity</div>`;
            }
        } else {
            content += `<div class="tooltip-content">No activity recorded</div>`;
        }

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
     * Show heatmap tooltip
     */
    showHeatmapTooltip(event, hourData, day, hour) {
        const tooltip = d3.select('#tooltip');

        const content = `
            <div class="tooltip-header">${day} ${hour}:00</div>
            <div class="tooltip-content">${hourData.hasData ? `Activity: ${hourData.activityScore}%` : 'No activity'}</div>
        `;

        let x = event.pageX;
        let y = event.pageY;

        if (x === undefined || x === 0) {
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
     * Show tooltip on hover (legacy compatibility)
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
     */
    renderEmptyState(viewType = 'linear') {
        const g = this.config.svg.append('g')
            .attr('class', 'empty-state')
            .attr('transform', `translate(${this.config.width / 2}, ${this.config.height / 2})`);

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
     * Render error state
     */
    renderErrorState() {
        const g = this.config.svg.append('g')
            .attr('class', 'error-state')
            .attr('transform', `translate(${this.config.width / 2}, ${this.config.height / 2})`);

        g.append('text')
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('fill', '#f44336')
            .text('Error loading chart');

        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', 30)
            .style('font-size', '14px')
            .style('fill', '#bbb')
            .text('Please try again later');
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
}

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModernActogramChart;
}