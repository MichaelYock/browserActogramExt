/**
 * IndexedDB Manager
 * Handles all IndexedDB operations for activity epoch storage
 */

const IndexedDBManager = {
    DB_NAME: 'ActogramDB',
    DB_VERSION: 2,
    STORES: {
        EPOCHS: 'epochs',
        CURRENT_EPOCH: 'currentEpoch'
    },

    db: null,

    /**
     * Initialize IndexedDB
     * Creates database and object stores if they don't exist
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB initialization error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Create epochs object store with timestamp index
                if (!db.objectStoreNames.contains(this.STORES.EPOCHS)) {
                    const epochStore = db.createObjectStore(this.STORES.EPOCHS, {
                        keyPath: 'timestamp'
                    });
                    // Create index on timestamp for efficient date range queries
                    epochStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('Created epochs object store');
                }

                // Create currentEpoch object store
                if (!db.objectStoreNames.contains(this.STORES.CURRENT_EPOCH)) {
                    db.createObjectStore(this.STORES.CURRENT_EPOCH, {
                        keyPath: 'id'
                    });
                    console.log('Created currentEpoch object store');
                }

                // Migration for version 2: Add trackerScore to existing epochs
                if (oldVersion < 2) {
                    const transaction = request.transaction;
                    const epochStore = transaction.objectStore(this.STORES.EPOCHS);

                    epochStore.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const updateData = cursor.value;
                            // If it has activityScore but no trackerScore, assume it's all tracker data
                            if (updateData.activityScore !== undefined && updateData.trackerScore === undefined) {
                                updateData.trackerScore = updateData.activityScore;
                                cursor.update(updateData);
                            }
                            cursor.continue();
                        }
                    };
                    console.log('Migrated data to version 2 (added trackerScore)');
                }
            };
        });
    },

    /**
     * Save a single activity epoch
     * @param {Object} epoch - { timestamp, activityScore, epochDuration }
     */
    async saveActivityEpoch(epoch) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.EPOCHS], 'readwrite');
            const store = transaction.objectStore(this.STORES.EPOCHS);
            const request = store.put(epoch);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Save multiple activity epochs in a single transaction
     * @param {Array} epochs - Array of epoch objects
     */
    async saveActivityEpochs(epochs) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.EPOCHS], 'readwrite');
            const store = transaction.objectStore(this.STORES.EPOCHS);

            epochs.forEach(epoch => {
                store.put(epoch);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },

    /**
     * Get activity data for a date range
     * @param {number} startTime - Start timestamp (ms), optional
     * @param {number} endTime - End timestamp (ms), optional
     * @returns {Promise<Array>} Array of epoch objects
     */
    async getActivityData(startTime, endTime) {
        console.log('Getting activity data from', startTime, 'to', endTime);
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.EPOCHS], 'readonly');
            const store = transaction.objectStore(this.STORES.EPOCHS);
            const index = store.index('timestamp');

            let range;
            if (startTime && endTime) {
                range = IDBKeyRange.bound(startTime, endTime);
            } else if (startTime) {
                range = IDBKeyRange.lowerBound(startTime);
            } else if (endTime) {
                range = IDBKeyRange.upperBound(endTime);
            }

            const request = range ? index.getAll(range) : store.getAll();

            request.onsuccess = () => {
                const epochs = request.result || [];
                console.log('Retrieved epochs count:', epochs.length);
                if (epochs.length > 0) {
                    console.log('Sample epochs:', epochs.slice(0, 3));
                }
                // Sort by timestamp ascending
                epochs.sort((a, b) => a.timestamp - b.timestamp);
                resolve(epochs);
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get current epoch being tracked
     * @returns {Promise<Object|null>}
     */
    async getCurrentEpoch() {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.CURRENT_EPOCH], 'readonly');
            const store = transaction.objectStore(this.STORES.CURRENT_EPOCH);
            const request = store.get('current');

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.epoch : null);
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Save current epoch being tracked
     * @param {Object} epoch - Current epoch state
     */
    async saveCurrentEpoch(epoch) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.CURRENT_EPOCH], 'readwrite');
            const store = transaction.objectStore(this.STORES.CURRENT_EPOCH);
            const request = store.put({ id: 'current', epoch: epoch });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all activity data
     */
    async clearAllData() {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                [this.STORES.EPOCHS, this.STORES.CURRENT_EPOCH],
                'readwrite'
            );

            const epochStore = transaction.objectStore(this.STORES.EPOCHS);
            const currentStore = transaction.objectStore(this.STORES.CURRENT_EPOCH);

            const clearEpochs = epochStore.clear();
            const clearCurrent = currentStore.clear();

            transaction.oncomplete = () => {
                console.log('All data cleared from IndexedDB');
                resolve();
            };

            transaction.onerror = () => reject(transaction.error);
        });
    },

    /**
     * Clean up old data based on retention period
     * @param {number} retentionDays - Number of days to retain
     * @returns {Promise<number>} Number of epochs deleted
     */
    async cleanupOldData(retentionDays) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.EPOCHS], 'readwrite');
            const store = transaction.objectStore(this.STORES.EPOCHS);
            const index = store.index('timestamp');
            const range = IDBKeyRange.upperBound(cutoffTime);

            let deleteCount = 0;
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deleteCount++;
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => {
                console.log(`Cleaned up ${deleteCount} old epochs`);
                resolve(deleteCount);
            };

            transaction.onerror = () => reject(transaction.error);
        });
    },

    /**
     * Migrate data from chrome.storage.local to IndexedDB
     * @param {Array} epochs - Array of epoch objects from chrome.storage
     * @param {Object} currentEpoch - Current epoch state from chrome.storage
     */
    async migrateFromChromeStorage(epochs, currentEpoch) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        console.log(`Migrating ${epochs.length} epochs from chrome.storage to IndexedDB...`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                [this.STORES.EPOCHS, this.STORES.CURRENT_EPOCH],
                'readwrite'
            );

            const epochStore = transaction.objectStore(this.STORES.EPOCHS);
            const currentStore = transaction.objectStore(this.STORES.CURRENT_EPOCH);

            // Add all epochs
            epochs.forEach(epoch => {
                epochStore.put(epoch);
            });

            // Save current epoch if exists
            if (currentEpoch) {
                currentStore.put({ id: 'current', epoch: currentEpoch });
            }

            transaction.oncomplete = () => {
                console.log('Migration to IndexedDB completed successfully');
                resolve();
            };

            transaction.onerror = () => {
                console.error('Migration error:', transaction.error);
                reject(transaction.error);
            };
        });
    },

    /**
     * Get count of all epochs
     * @returns {Promise<number>}
     */
    async getEpochCount() {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.EPOCHS], 'readonly');
            const store = transaction.objectStore(this.STORES.EPOCHS);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndexedDBManager;
}
