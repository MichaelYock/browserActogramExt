/**
 * Analysis Utilities
 * Functions for detecting sleep/wake cycles and analyzing trends
 */

const AnalysisUtils = {
    /**
     * Detect sleep/wake cycles from activity data
     * @param {Array} activityData - Array of epoch objects with timestamps and activity scores
     * @param {Object} settings - User settings for analysis
     * @returns {Object} Sleep/wake cycle analysis results
     */
    detectSleepWakeCycles(activityData, settings = {}) {
        if (!activityData || activityData.length === 0) {
            return { cycles: [], summary: {} };
        }

        // Group data by day
        const dailyData = this.groupActivityByDay(activityData);
        
        // Detect sleep periods for each day
        const cycles = dailyData.map(day => {
            const sleepPeriod = this.detectSleepPeriod(day.epochs, settings);
            return {
                date: new Date(day.date),
                sleepStart: sleepPeriod ? sleepPeriod.start : null,
                sleepEnd: sleepPeriod ? sleepPeriod.end : null,
                sleepDuration: sleepPeriod ? sleepPeriod.duration : null,
                epochs: day.epochs
            };
        });

        // Calculate summary statistics
        const summary = this.calculateSleepSummary(cycles);
        
        return { cycles, summary };
    },

    /**
     * Group activity data by day
     * @param {Array} activityData - Array of epoch objects
     * @returns {Array} Array of daily data objects
     */
    groupActivityByDay(activityData) {
        const dailyMap = new Map();
        
        activityData.forEach(epoch => {
            const date = new Date(epoch.timestamp);
            date.setHours(0, 0, 0, 0);
            const dateKey = date.toISOString().split('T')[0];
            
            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey,
                    epochs: []
                });
            }
            
            dailyMap.get(dateKey).epochs.push(epoch);
        });
        
        // Convert to array and sort by date
        return Array.from(dailyMap.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    /**
     * Detect sleep period for a single day
     * @param {Array} epochs - Epochs for a single day
     * @param {Object} settings - Analysis settings
     * @returns {Object|null} Sleep period details or null
     */
    detectSleepPeriod(epochs, settings = {}) {
        if (!epochs || epochs.length === 0) return null;
        
        // Sort epochs by timestamp
        epochs.sort((a, b) => a.timestamp - b.timestamp);
        
        // Find periods of inactivity (potential sleep)
        const inactivityThreshold = settings.inactivityThreshold || 20; // minutes
        const minSleepDuration = settings.minSleepDuration || 180; // minutes (3 hours)
        
        let sleepPeriods = [];
        let currentStart = null;
        let currentDuration = 0;
        let longestPeriod = null;
        
        for (let i = 0; i < epochs.length; i++) {
            const epoch = epochs[i];
            
            if (epoch.activityScore < 20) { // Low activity
                if (currentStart === null) {
                    currentStart = epoch.timestamp;
                    currentDuration = 0;
                }
                currentDuration += settings.epochDuration || 15;
            } else {
                // Activity detected, end current period if it exists
                if (currentStart !== null && currentDuration >= minSleepDuration) {
                    const period = {
                        start: currentStart,
                        end: epoch.timestamp,
                        duration: currentDuration
                    };
                    
                    if (!longestPeriod || currentDuration > longestPeriod.duration) {
                        longestPeriod = period;
                    }
                }
                currentStart = null;
                currentDuration = 0;
            }
        }
        
        // Handle case where sleep period extends to end of data
        if (currentStart !== null && currentDuration >= minSleepDuration) {
            const period = {
                start: currentStart,
                end: epochs[epochs.length - 1].timestamp,
                duration: currentDuration
            };
            
            if (!longestPeriod || currentDuration > longestPeriod.duration) {
                longestPeriod = period;
            }
        }
        
        return longestPeriod;
    },

    /**
     * Calculate sleep summary statistics
     * @param {Array} cycles - Sleep cycle data
     * @returns {Object} Summary statistics
     */
    calculateSleepSummary(cycles) {
        if (!cycles || cycles.length === 0) {
            return {};
        }
        
        // Extract valid sleep data
        const validCycles = cycles.filter(c => c.sleepStart && c.sleepEnd);
        
        if (validCycles.length === 0) {
            return { totalDays: cycles.length };
        }
        
        // Calculate sleep start/end times
        const sleepStartHours = validCycles.map(cycle => {
            const start = new Date(cycle.sleepStart);
            return start.getHours() + start.getMinutes() / 60;
        });
        
        const wakeHours = validCycles.map(cycle => {
            const end = new Date(cycle.sleepEnd);
            return end.getHours() + end.getMinutes() / 60;
        });
        
        // Calculate average sleep duration
        const avgSleepDuration = validCycles.reduce((sum, cycle) => 
            sum + cycle.sleepDuration, 0) / validCycles.length;
        
        // Calculate variance in sleep times
        const sleepStartMean = sleepStartHours.reduce((a, b) => a + b, 0) / sleepStartHours.length;
        const sleepStartVariance = sleepStartHours.reduce((sum, hour) => 
            sum + Math.pow(hour - sleepStartMean, 2), 0) / sleepStartHours.length;
        
        return {
            totalDays: cycles.length,
            daysWithSleepData: validCycles.length,
            avgSleepDuration: Math.round(avgSleepDuration),
            avgSleepStart: sleepStartMean,
            avgWakeTime: wakeHours.reduce((a, b) => a + b, 0) / wakeHours.length,
            sleepRegularity: Math.sqrt(sleepStartVariance), // Lower is more regular
            regularity: validCycles.length / cycles.length // Data completeness
        };
    },

    /**
     * Analyze trends in activity data
     * @param {Array} activityData - Array of epoch objects
     * @returns {Object} Trend analysis results
     */
    analyzeTrends(activityData) {
        if (!activityData || activityData.length === 0) {
            return { trends: {}, patterns: [] };
        }
        
        // Group by day and calculate daily metrics
        const dailyData = this.groupActivityByDay(activityData).map(day => {
            const totalEpochs = day.epochs.length;
            const activeEpochs = day.epochs.filter(e => e.activityScore > 20).length;
            const veryActiveEpochs = day.epochs.filter(e => e.activityScore > 80).length;
            
            const avgActivity = day.epochs.reduce((sum, e) => sum + e.activityScore, 0) / totalEpochs;
            const activePercentage = (activeEpochs / totalEpochs) * 100;
            const veryActivePercentage = (veryActiveEpochs / totalEpochs) * 100;
            
            return {
                date: day.date,
                avgActivity: Math.round(avgActivity),
                activePercentage: Math.round(activePercentage),
                veryActivePercentage: Math.round(veryActivePercentage),
                epochs: day.epochs
            };
        });
        
        // Calculate trends using linear regression
        const trends = {};
        
        // Trend for average activity
        const activityTrend = this.calculateTrend(dailyData.map(d => d.avgActivity));
        trends.avgActivity = {
            slope: activityTrend.slope,
            direction: activityTrend.slope > 0 ? 'increasing' : 'decreasing',
            magnitude: Math.abs(activityTrend.slope)
        };
        
        // Trend for active percentage
        const activeTrend = this.calculateTrend(dailyData.map(d => d.activePercentage));
        trends.activePercentage = {
            slope: activeTrend.slope,
            direction: activeTrend.slope > 0 ? 'increasing' : 'decreasing',
            magnitude: Math.abs(activeTrend.slope)
        };
        
        // Trend for very active percentage
        const veryActiveTrend = this.calculateTrend(dailyData.map(d => d.veryActivePercentage));
        trends.veryActivePercentage = {
            slope: veryActiveTrend.slope,
            direction: veryActiveTrend.slope > 0 ? 'increasing' : 'decreasing',
            magnitude: Math.abs(veryActiveTrend.slope)
        };
        
        // Identify patterns (e.g., weekday vs weekend)
        const patterns = this.identifyPatterns(dailyData);
        
        return { trends, patterns };
    },

    /**
     * Calculate linear trend using least squares regression
     * @param {Array} values - Array of values
     * @returns {Object} Trend information
     */
    calculateTrend(values) {
        if (!values || values.length === 0) {
            return { slope: 0, intercept: 0 };
        }
        
        const n = values.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumXX += i * i;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return { slope, intercept };
    },

    /**
     * Identify patterns in daily data
     * @param {Array} dailyData - Daily activity metrics
     * @returns {Array} Pattern objects
     */
    identifyPatterns(dailyData) {
        if (!dailyData || dailyData.length === 0) {
            return [];
        }
        
        // Weekday vs weekend pattern
        const weekdays = dailyData.filter(day => {
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();
            return dayOfWeek > 0 && dayOfWeek < 6; // Monday-Friday
        });
        
        const weekends = dailyData.filter(day => {
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();
            return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
        });
        
        const avgWeekdayActivity = weekdays.reduce((sum, day) => 
            sum + day.avgActivity, 0) / (weekdays.length || 1);
            
        const avgWeekendActivity = weekends.reduce((sum, day) => 
            sum + day.avgActivity, 0) / (weekends.length || 1);
        
        const patterns = [];
        
        if (weekdays.length > 0 && weekends.length > 0) {
            patterns.push({
                type: 'weekday_vs_weekend',
                description: avgWeekdayActivity > avgWeekendActivity 
                    ? 'More active on weekdays than weekends' 
                    : 'More active on weekends than weekdays',
                weekdayAvg: Math.round(avgWeekdayActivity),
                weekendAvg: Math.round(avgWeekendActivity)
            });
        }
        
        return patterns;
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalysisUtils;
} else if (typeof window !== 'undefined') {
    // For browser environments
    window.AnalysisUtils = AnalysisUtils;
}