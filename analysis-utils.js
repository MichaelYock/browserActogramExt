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
        console.log('Detecting sleep/wake cycles for activity data length:', activityData ? activityData.length : 0);
        if (!activityData || activityData.length === 0) {
            console.log('No activity data available');
            return { cycles: [], summary: {} };
        }

        // Group data by day
        const dailyData = this.groupActivityByDay(activityData);
        console.log('Grouped daily data length:', dailyData.length);

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

        console.log('Detected cycles:', cycles);

        // Calculate summary statistics
        const summary = this.calculateSleepSummary(cycles);
        console.log('Sleep summary:', summary);

        // Add circadian rhythm analysis
        const circadianAnalysis = this.analyzeCircadianRhythms(activityData);
        console.log('Circadian analysis:', circadianAnalysis);

        return { cycles, summary, circadian: circadianAnalysis };
    },

    /**
     * Group activity data by day
     * @param {Array} activityData - Array of epoch objects
     * @returns {Array} Array of daily data objects
     */
    groupActivityByDay(activityData) {
        console.log('Grouping activity data by day, length:', activityData ? activityData.length : 0);
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
        const result = Array.from(dailyMap.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));
            
        console.log('Grouped daily data result length:', result.length);
        if (result.length > 0) {
            console.log('Sample day data:', result[0]);
        }
        
        return result;
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

        // For browser data, we look for gaps between activity as potential sleep periods
        const minSleepDuration = settings.minSleepDuration || 180; // minutes (3 hours)

        // Look for gaps between epochs that might indicate sleep
        let longestGap = null;
        
        for (let i = 1; i < epochs.length; i++) {
            const prevEpoch = epochs[i-1];
            const currentEpoch = epochs[i];
            
            // Calculate gap between epochs
            const gapMs = currentEpoch.timestamp - prevEpoch.timestamp;
            const gapMinutes = gapMs / (1000 * 60);
            
            // If gap is significant, it might be sleep time
            if (gapMinutes >= minSleepDuration) {
                const gapPeriod = {
                    start: prevEpoch.timestamp,
                    end: currentEpoch.timestamp,
                    duration: gapMinutes
                };
                
                if (!longestGap || gapMinutes > longestGap.duration) {
                    longestGap = gapPeriod;
                }
            }
        }

        return longestGap;
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
    },

    /**
     * Analyze circadian rhythms and chronotype
     * @param {Array} activityData - Array of epoch objects
     * @returns {Object} Circadian rhythm analysis results
     */
    analyzeCircadianRhythms(activityData) {
        if (!activityData || activityData.length === 0) {
            return { chronotype: null, rhythmStability: null, socialJetlag: null };
        }

        // Group data by day
        const dailyData = this.groupActivityByDay(activityData);

        // Calculate hourly activity patterns
        const hourlyPatterns = this.calculateHourlyPatterns(dailyData);

        // Detect chronotype
        const chronotype = this.detectChronotype(hourlyPatterns);

        // Calculate rhythm stability
        const rhythmStability = this.calculateRhythmStability(dailyData);

        // Calculate social jetlag
        const socialJetlag = this.calculateSocialJetlag(dailyData);

        return {
            chronotype,
            rhythmStability,
            socialJetlag
        };
    },

    /**
     * Calculate average activity patterns by hour of day
     * @param {Array} dailyData - Daily activity data grouped by day
     * @returns {Array} Average activity for each hour (0-23)
     */
    calculateHourlyPatterns(dailyData) {
        // Initialize array for each hour (0-23)
        const hourlyTotals = Array(24).fill(0);
        const hourlyCounts = Array(24).fill(0);

        // Process each day's data
        dailyData.forEach(day => {
            day.epochs.forEach(epoch => {
                const date = new Date(epoch.timestamp);
                const hour = date.getHours();

                hourlyTotals[hour] += epoch.activityScore;
                hourlyCounts[hour]++;
            });
        });

        // Calculate averages
        const hourlyAverages = hourlyTotals.map((total, hour) => {
            return hourlyCounts[hour] > 0 ? total / hourlyCounts[hour] : 0;
        });

        return hourlyAverages;
    },

    /**
     * Detect chronotype based on activity patterns
     * @param {Array} hourlyPatterns - Average activity by hour
     * @returns {Object} Chronotype information
     */
    detectChronotype(hourlyPatterns) {
        if (!hourlyPatterns || hourlyPatterns.length !== 24) {
            return null;
        }

        // Find peak activity hour
        let peakHour = 0;
        let maxActivity = 0;

        for (let i = 0; i < 24; i++) {
            if (hourlyPatterns[i] > maxActivity) {
                maxActivity = hourlyPatterns[i];
                peakHour = i;
            }
        }

        // Classify chronotype based on peak hour
        let type, description;
        if (peakHour >= 4 && peakHour < 11) {
            type = 'morning';
            description = 'Morning person (Lark)';
        } else if (peakHour >= 11 && peakHour < 17) {
            type = 'intermediate';
            description = 'Intermediate chronotype';
        } else {
            type = 'evening';
            description = 'Evening person (Owl)';
        }

        return {
            type,
            description,
            peakHour,
            peakActivity: Math.round(maxActivity)
        };
    },

    /**
     * Calculate rhythm stability across days
     * @param {Array} dailyData - Daily activity data
     * @returns {Object} Rhythm stability metrics
     */
    calculateRhythmStability(dailyData) {
        if (!dailyData || dailyData.length === 0) {
            return null;
        }

        // Calculate daily activity patterns (hourly distribution)
        const dailyPatterns = dailyData.map(day => {
            const hourlyActivity = Array(24).fill(0);
            day.epochs.forEach(epoch => {
                const hour = new Date(epoch.timestamp).getHours();
                hourlyActivity[hour] += epoch.activityScore;
            });
            return hourlyActivity;
        });

        // Calculate average pattern
        const avgPattern = Array(24).fill(0);
        dailyPatterns.forEach(pattern => {
            for (let i = 0; i < 24; i++) {
                avgPattern[i] += pattern[i];
            }
        });

        for (let i = 0; i < 24; i++) {
            avgPattern[i] /= dailyPatterns.length;
        }

        // Calculate deviation from average pattern for each day
        const deviations = dailyPatterns.map(pattern => {
            let sumSquaredDiff = 0;
            for (let i = 0; i < 24; i++) {
                const diff = pattern[i] - avgPattern[i];
                sumSquaredDiff += diff * diff;
            }
            return Math.sqrt(sumSquaredDiff / 24);
        });

        // Calculate average deviation
        const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;

        // Normalize stability score (0-100, higher is more stable)
        const maxPossibleDeviation = 100; // Assuming max activity score is 100
        const stabilityScore = Math.max(0, Math.min(100, 100 - (avgDeviation / maxPossibleDeviation) * 100));

        return {
            stabilityScore: Math.round(stabilityScore),
            description: stabilityScore > 70 ? 'Highly regular' :
                        stabilityScore > 40 ? 'Moderately regular' : 'Irregular',
            dailyVariations: deviations.length
        };
    },

    /**
     * Calculate social jetlag (difference between weekday and weekend sleep timing)
     * @param {Array} dailyData - Daily activity data
     * @returns {Object} Social jetlag metrics
     */
    calculateSocialJetlag(dailyData) {
        if (!dailyData || dailyData.length < 7) {
            return null; // Need at least a week of data
        }

        // Separate weekdays and weekends
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

        if (weekdays.length < 3 || weekends.length < 2) {
            return null; // Need sufficient data for both
        }

        // Detect sleep midpoints for weekdays and weekends
        const weekdaySleep = this.detectAverageSleepMidpoint(weekdays);
        const weekendSleep = this.detectAverageSleepMidpoint(weekends);

        if (!weekdaySleep || !weekendSleep) {
            return null;
        }

        // Calculate social jetlag (absolute difference in hours)
        const jetlagHours = Math.abs(weekendSleep.midpoint - weekdaySleep.midpoint);

        return {
            jetlagHours: Math.round(jetlagHours * 10) / 10,
            weekdayMidpoint: weekdaySleep.midpoint,
            weekendMidpoint: weekendSleep.midpoint,
            description: jetlagHours < 2 ? 'Well-aligned schedule with minimal social jetlag' :
                        jetlagHours < 4 ? 'Moderate social jetlag - consider consistent sleep times' :
                        'Significant social jetlag - large difference between weekday/weekend schedules'
        };
    },

    /**
     * Detect average sleep midpoint for a group of days
     * @param {Array} days - Array of daily data
     * @returns {Object} Sleep midpoint information
     */
    detectAverageSleepMidpoint(days) {
        if (!days || days.length === 0) {
            return null;
        }

        // Detect sleep periods for each day
        const sleepPeriods = days.map(day => {
            return this.detectSleepPeriod(day.epochs);
        }).filter(period => period !== null);

        if (sleepPeriods.length === 0) {
            return null;
        }

        // Calculate midpoints for each sleep period
        const midpoints = sleepPeriods.map(period => {
            const start = new Date(period.start);
            const end = new Date(period.end);

            // Handle overnight sleep (end time is next day)
            let endHours = end.getHours() + end.getMinutes() / 60;
            const startHours = start.getHours() + start.getMinutes() / 60;

            if (endHours < startHours) {
                endHours += 24; // Add 24 hours for next day
            }

            return (startHours + endHours) / 2;
        });

        // Calculate average midpoint
        const avgMidpoint = midpoints.reduce((sum, mp) => sum + mp, 0) / midpoints.length;

        return {
            midpoint: avgMidpoint % 24, // Keep within 24-hour range
            count: sleepPeriods.length
        };
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalysisUtils;
} else if (typeof window !== 'undefined') {
    // For browser environments
    window.AnalysisUtils = AnalysisUtils;
}