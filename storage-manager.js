/**
 * Storage Manager
 * Handles all data storage, retrieval, and management operations
 * Uses IndexedDB for epoch data and chrome.storage.sync for settings
 */

const StorageManager = {
    // Storage keys for chrome.storage.sync
    KEYS: {
        SETTINGS: 'settings',
        UI_PREFERENCES: 'uiPreferences'
    },

    // Default settings
    DEFAULT_SETTINGS: {
        epochDuration: 15, // minutes
        idleThreshold: 15, // seconds
        retentionDays: -1, // -1 = Forever
        colorScheme: 'blue',
        plotType: 'double' // 'single' or 'double'
    },

    // Default UI preferences
    DEFAULT_UI_PREFERENCES: {
        daysToShow: 2
    },

    /**
     * Initialize storage with default settings if needed
     * Also handles migration from chrome.storage.local to IndexedDB
     */
    async initialize() {
        // Initialize IndexedDB
        await IndexedDBManager.initialize();

        // Migrate settings if needed (chunk -> epoch terminology)
        let settings = await this.getSettings();
        if (settings && settings.chunkDuration) {
            console.log('Migrating settings from chunk to epoch...');
            settings.epochDuration = settings.chunkDuration;
            delete settings.chunkDuration;
            await this.saveSettings(settings);
        }

        if (!settings || Object.keys(settings).length === 0) {
            await this.saveSettings(this.DEFAULT_SETTINGS);
        }

        // Check if we need to migrate from chrome.storage.local to IndexedDB
        const migrationStatus = await chrome.storage.sync.get('indexedDBMigrationComplete');

        if (!migrationStatus.indexedDBMigrationComplete) {
            console.log('Starting migration from chrome.storage.local to IndexedDB...');

            try {
                // Get data from chrome.storage.local (old storage location)
                const localData = await chrome.storage.local.get([
                    'activityData',
                    'currentEpoch',
                    'currentChunk' // old key name
                ]);

                let activityData = localData.activityData || [];
                let currentEpoch = localData.currentEpoch || localData.currentChunk;

                // Migrate chunk terminology to epoch if needed
                activityData = activityData.map(item => {
                    const cleaned = { ...item };
                    if (item.chunkDuration) {
                        cleaned.epochDuration = item.chunkDuration;
                        delete cleaned.chunkDuration;
                    }
                    return cleaned;
                });

                // Migrate current epoch terminology
                if (currentEpoch && currentEpoch.chunkDuration) {
                    currentEpoch.epochDuration = currentEpoch.chunkDuration;
                    delete currentEpoch.chunkDuration;
                }

                // Migrate to IndexedDB
                if (activityData.length > 0 || currentEpoch) {
                    await IndexedDBManager.migrateFromChromeStorage(activityData, currentEpoch);
                    console.log(`Migrated ${activityData.length} epochs to IndexedDB`);
                }

                // Mark migration as complete
                await chrome.storage.sync.set({ indexedDBMigrationComplete: true });
                console.log('Migration to IndexedDB completed successfully');

                // Keep old data as backup for now (can be removed later)
                // await chrome.storage.local.remove(['activityData', 'currentEpoch', 'currentChunk']);
            } catch (error) {
                console.error('Error during IndexedDB migration:', error);
                // Don't mark as complete if migration failed
            }
        }
    },

    /**
     * Get user settings
     */
    async getSettings() {
        try {
            const result = await chrome.storage.sync.get(this.KEYS.SETTINGS);
            return result[this.KEYS.SETTINGS] || this.DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error getting settings:', error);
            return this.DEFAULT_SETTINGS;
        }
    },

    /**
     * Save user settings
     */
    async saveSettings(settings) {
        try {
            await chrome.storage.sync.set({ [this.KEYS.SETTINGS]: settings });
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    },

    /**
     * Get UI preferences
     */
    async getUIPreferences() {
        try {
            const result = await chrome.storage.sync.get(this.KEYS.UI_PREFERENCES);
            return result[this.KEYS.UI_PREFERENCES] || this.DEFAULT_UI_PREFERENCES;
        } catch (error) {
            console.error('Error getting UI preferences:', error);
            return this.DEFAULT_UI_PREFERENCES;
        }
    },

    /**
     * Save UI preferences
     */
    async saveUIPreferences(preferences) {
        try {
            await chrome.storage.sync.set({ [this.KEYS.UI_PREFERENCES]: preferences });
            return true;
        } catch (error) {
            console.error('Error saving UI preferences:', error);
            return false;
        }
    },

    /**
     * Save an activity epoch
     * @param {Object} epoch - { timestamp, activityScore, epochDuration }
     */
    async saveActivityEpoch(epoch) {
        try {
            await IndexedDBManager.saveActivityEpoch(epoch);
        } catch (error) {
            console.error('Error saving activity epoch:', error);
        }
    },

    /**
     * Get activity data for a date range
     * @param {number} startTime - Start timestamp (ms), optional
     * @param {number} endTime - End timestamp (ms), optional
     * @returns {Promise<Array>} Array of epoch objects
     */
    async getActivityData(startTime, endTime) {
        try {
            return await IndexedDBManager.getActivityData(startTime, endTime);
        } catch (error) {
            console.error('Error getting activity data:', error);
            return [];
        }
    },

    /**
     * Clear all activity data
     */
    async clearAllData() {
        try {
            await IndexedDBManager.clearAllData();
            console.log('All activity data cleared from IndexedDB');
        } catch (error) {
            console.error('Error clearing data:', error);
        }
    },

    /**
     * Clean up old data based on retention settings
     */
    async cleanupOldData() {
        try {
            const settings = await this.getSettings();
            const retentionDays = settings.retentionDays;

            if (retentionDays <= 0) {
                return; // Keep all data
            }

            const deletedCount = await IndexedDBManager.cleanupOldData(retentionDays);
            console.log(`Cleaned up ${deletedCount} epochs older than ${retentionDays} days`);
        } catch (error) {
            console.error('Error cleaning up old data:', error);
        }
    },

    /**
     * Export all data as JSON
     */
    async exportData() {
        try {
            const settings = await this.getSettings();
            const activityData = await this.getActivityData();

            // Calculate epoch length in seconds
            const epochDuration = settings.epochDuration || 15;
            const epochLengthSeconds = epochDuration * 60;

            // Get time zone
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Map epochs to export format
            const epochs = activityData.map(item => ({
                t: new Date(item.timestamp).toISOString(),
                activity: item.activityScore
            }));

            const exportObject = {
                epoch_length_seconds: epochLengthSeconds,
                time_zone: timeZone,
                epochs: epochs
            };

            return exportObject;
        } catch (error) {
            console.error('Error exporting data:', error);
            return null;
        }
    },

    /**
     * Import and merge data from JSON
     * @param {Object} importData - Exported data object
     * @param {boolean} merge - If true, merge with existing data; if false, replace
     */
    async importData(importData, merge = true) {
        try {
            let processedData = [];

            // Check for new format (epochs array)
            if (importData.epochs && Array.isArray(importData.epochs)) {
                // Calculate epoch duration in minutes
                const epochDuration = (importData.epoch_length_seconds || 900) / 60;

                processedData = importData.epochs.map(item => ({
                    timestamp: new Date(item.t).getTime(),
                    activityScore: item.activity,
                    epochDuration: epochDuration
                }));
            }
            // Fallback to old format (activityData array)
            else if (importData.activityData && Array.isArray(importData.activityData)) {
                processedData = importData.activityData;
            } else {
                throw new Error('Invalid import data format');
            }

            if (merge) {
                // Merge with existing data
                const existingData = await this.getActivityData();
                const mergedData = this._mergeActivityData(existingData, processedData);

                // Clear and re-import all data
                await IndexedDBManager.clearAllData();
                await IndexedDBManager.saveActivityEpochs(mergedData);
            } else {
                // Replace existing data
                await IndexedDBManager.clearAllData();
                await IndexedDBManager.saveActivityEpochs(processedData);
            }

            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    },

    /**
     * Merge two activity data arrays, avoiding duplicates
     * @private
     */
    _mergeActivityData(existing, imported) {
        const merged = [...existing];
        const existingTimestamps = new Set(existing.map(epoch => epoch.timestamp));

        // Add imported epochs that don't exist
        for (const epoch of imported) {
            if (!existingTimestamps.has(epoch.timestamp)) {
                merged.push(epoch);
            } else {
                // If timestamp exists, keep the one with higher activity score (more complete data)
                const existingIndex = merged.findIndex(e => e.timestamp === epoch.timestamp);
                if (epoch.activityScore > merged[existingIndex].activityScore) {
                    merged[existingIndex] = epoch;
                }
            }
        }

        // Sort by timestamp
        merged.sort((a, b) => a.timestamp - b.timestamp);

        return merged;
    },

    /**
     * Get current epoch being tracked
     */
    async getCurrentEpoch() {
        try {
            return await IndexedDBManager.getCurrentEpoch();
        } catch (error) {
            console.error('Error getting current epoch:', error);
            return null;
        }
    },

    /**
     * Save current epoch being tracked
     */
    async saveCurrentEpoch(epoch) {
        try {
            await IndexedDBManager.saveCurrentEpoch(epoch);
        } catch (error) {
            console.error('Error saving current epoch:', error);
        }
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
