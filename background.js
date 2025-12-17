/**
 * Background Service Worker
 * Monitors browser activity and stores data in time epochs
 */

// Import storage manager (for Chrome MV3, we need to use importScripts)
if (typeof importScripts === 'function') {
    importScripts('indexeddb-manager.js', 'storage-manager.js', 'analysis-utils.js');
}

// Activity tracking state - kept in memory for speed, but persisted to storage
let trackingState = {
    isTracking: false,
    lastCheckTime: Date.now(),
    lastState: 'active'
};

let currentEpoch = {
    startTime: null,
    activeSeconds: 0,
    totalSeconds: 0,
    epochDuration: 15 // minutes, will be loaded from settings
};

// Initialization state
let isInitialized = false;
let isInitializing = false;
let initializationPromise = null;
let serviceWorkerRestarts = 0;

/**
 * Initialize the background worker
 */
async function initialize() {
    // Make initialization idempotent to prevent race conditions
    if (isInitialized) return;
    if (initializationPromise) return initializationPromise;

    isInitializing = true;
    serviceWorkerRestarts++;

    console.log(`Browser Actogram: Initializing background worker (restart #${serviceWorkerRestarts})`);

    initializationPromise = (async () => {
        try {
            // Initialize storage
            await StorageManager.initialize();

            // Load settings
            const settings = await StorageManager.getSettings();
            currentEpoch.epochDuration = settings.epochDuration;

            // Restore tracking state
            const savedState = await StorageManager.getTrackingState();
            if (savedState) {
                trackingState = savedState;
                // If we were tracking, we might need to account for time passed while SW was dead
                // For now, let's just resume from now to avoid huge jumps if browser was closed
                trackingState.lastCheckTime = Date.now();
            }

            // Try to restore current epoch if exists
            const savedEpoch = await StorageManager.getCurrentEpoch();
            if (savedEpoch) {
                currentEpoch = savedEpoch;
            } else {
                // Start new epoch
                startNewEpoch();
            }

            // Start activity monitoring if it was previously enabled or just always start it
            // The extension is designed to always track when installed
            startTracking();

            // Set up alarms using the safe creation method
            await ensureAlarms();

            isInitialized = true;
            console.log('Browser Actogram: Initialization complete');
        } catch (error) {
            console.error('Browser Actogram: Initialization failed', error);
            // Reset initialization state on failure
            isInitialized = false;
            isInitializing = false;
            initializationPromise = null;
            throw error;
        } finally {
            isInitializing = false;
        }
    })();

    return initializationPromise;
}

/**
 * Start a new activity epoch
 */
function startNewEpoch() {
    currentEpoch = {
        startTime: Date.now(),
        activeSeconds: 0,
        totalSeconds: 0,
        epochDuration: currentEpoch.epochDuration || 15 // Fallback default
    };
}

/**
 * Start tracking browser activity
 */
async function startTracking() {
    if (trackingState.isTracking && isInitialized) return;

    trackingState.isTracking = true;
    trackingState.lastCheckTime = Date.now();

    // Get initial idle state
    const settings = await StorageManager.getSettings();
    const state = await chrome.idle.queryState(settings.idleThreshold);
    trackingState.lastState = state;

    await StorageManager.saveTrackingState(trackingState);

    // Use alarms for periodic checks (MV3 compliant)
    // 1 minute is the minimum reliable interval for released extensions
    chrome.alarms.create('activityHeartbeat', { periodInMinutes: 1 });

    // Also listen for idle state changes
    // We need to set the detection interval based on settings
    chrome.idle.setDetectionInterval(settings.idleThreshold);

    if (!chrome.idle.onStateChanged.hasListener(handleIdleStateChange)) {
        chrome.idle.onStateChanged.addListener(handleIdleStateChange);
    }

    console.log('Browser Actogram: Activity tracking started');
}

/**
 * Stop tracking browser activity
 */
async function stopTracking() {
    if (!trackingState.isTracking) return;

    trackingState.isTracking = false;
    await StorageManager.saveTrackingState(trackingState);

    chrome.alarms.clear('activityHeartbeat');

    if (chrome.idle.onStateChanged.hasListener(handleIdleStateChange)) {
        chrome.idle.onStateChanged.removeListener(handleIdleStateChange);
    }

    console.log('Browser Actogram: Activity tracking stopped');
}

/**
 * Update activity based on elapsed time
 */
async function updateActivity() {
    if (!isInitialized) return;

    const now = Date.now();
    const timeDeltaSeconds = Math.max(0, Math.floor((now - trackingState.lastCheckTime) / 1000));

    // Update current epoch total seconds by accumulating time
    if (!currentEpoch.startTime) {
        startNewEpoch();
    }

    // Accumulate time instead of resetting
    currentEpoch.totalSeconds += timeDeltaSeconds;

    // If we were active, add to active seconds
    if (trackingState.lastState === 'active') {
        currentEpoch.activeSeconds += timeDeltaSeconds;

        // Cap at total seconds (sanity check)
        if (currentEpoch.activeSeconds > currentEpoch.totalSeconds) {
            currentEpoch.activeSeconds = currentEpoch.totalSeconds;
        }
    }

    // Update state
    trackingState.lastCheckTime = now;

    // Periodically persist state to storage (every 30 seconds)
    const shouldPersist = timeDeltaSeconds >= 30 ||
                         currentEpoch.totalSeconds % 30 === 0 ||
                         currentEpoch.activeSeconds % 30 === 0;

    if (shouldPersist) {
        await StorageManager.saveTrackingState(trackingState);
    }

    // Check if epoch duration has elapsed
    const epochDurationMs = currentEpoch.epochDuration * 60 * 1000;
    if (now - currentEpoch.startTime >= epochDurationMs) {
        await finalizeEpoch();
    } else {
        // Save current epoch state
        await StorageManager.saveCurrentEpoch(currentEpoch);
    }
}

/**
 * Check current idle state (Heartbeat)
 */
async function checkIdleState() {
    try {
        // First update activity based on previous state and time passed
        // Use gap-aware update to handle service worker inactivity
        await updateActivityWithCheckpoint();

        // Then check current real state to ensure we are in sync
        const settings = await StorageManager.getSettings();
        const currentState = await chrome.idle.queryState(settings.idleThreshold);

        if (currentState !== trackingState.lastState) {
            trackingState.lastState = currentState;
            await StorageManager.saveTrackingState(trackingState);
        }

        // Add heartbeat timestamp for worker health monitoring
        await chrome.storage.local.set({
            lastHeartbeat: Date.now()
        });
    } catch (error) {
        console.error('Error checking idle state:', error);
        // Attempt to reinitialize if critical error
        if (error.message && (error.message.includes('not initialized') || error.message.includes('permission'))) {
            isInitialized = false;
            initializationPromise = null;
            await initialize();
        }
    }
}

/**
 * Handle idle state changes
 */
async function handleIdleStateChange(newState) {
    console.log('Idle state changed:', newState);

    // Update activity up to this point using the OLD state
    // Use gap-aware update to handle service worker inactivity
    await updateActivityWithCheckpoint();

    // Now switch to NEW state
    trackingState.lastState = newState;
    await StorageManager.saveTrackingState(trackingState);
}

/**
 * Ensure alarms are properly set without duplicates
 */
async function ensureAlarms() {
    const alarms = await chrome.alarms.getAll();
    const alarmNames = alarms.map(a => a.name);

    if (!alarmNames.includes('activityHeartbeat')) {
        chrome.alarms.create('activityHeartbeat', { periodInMinutes: 1 });
    }

    if (!alarmNames.includes('cleanup')) {
        chrome.alarms.create('cleanup', { periodInMinutes: 1440 });
    }

    if (!alarmNames.includes('sleepAnalysis')) {
        chrome.alarms.create('sleepAnalysis', {
            delayInMinutes: 120,
            periodInMinutes: 1440
        });
    }
}

/**
 * Get current browser idle state
 */
async function getBrowserState() {
    try {
        const settings = await StorageManager.getSettings();
        return await chrome.idle.queryState(settings.idleThreshold);
    } catch (error) {
        console.error('Error getting browser state:', error);
        // Default to active if we can't determine state
        return 'active';
    }
}

/**
 * Update activity with gap detection
 * Handles cases where service worker was inactive for extended periods
 */
async function updateActivityWithCheckpoint() {
    if (!isInitialized) return;

    const now = Date.now();
    const elapsedMs = now - trackingState.lastCheckTime;

    // Don't trust large time gaps - worker was likely dead
    const MAX_TRUSTED_GAP_MS = 120000; // 2 minutes

    if (elapsedMs > MAX_TRUSTED_GAP_MS) {
        // Worker was dead too long - create a "gap" epoch
        await createGapEpoch(trackingState.lastCheckTime, now);

        // Query current state after gap instead of assuming continuation
        const currentState = await getBrowserState();
        trackingState.lastState = currentState; // Update to actual current state

        trackingState.lastCheckTime = now;
        await StorageManager.saveTrackingState(trackingState);
        return;
    }

    // Normal update for short gaps
    await updateActivity();
}

/**
 * Create a gap epoch to indicate missing data
 */
async function createGapEpoch(startTime, endTime) {
    try {
        // Calculate gap duration with minimum of 1 minute
        const gapDurationMinutes = Math.max(1, Math.round((endTime - startTime) / (60 * 1000)));

        // Save a special epoch indicating missing data
        const gapEpoch = {
            timestamp: startTime,
            activityScore: -1, // Special value for gaps
            epochDuration: gapDurationMinutes,
            isGap: true
        };

        await StorageManager.saveActivityEpoch(gapEpoch);
        console.log('Created gap epoch due to service worker inactivity:', gapEpoch);
    } catch (error) {
        console.error('Error creating gap epoch:', error);
    }
}

/**
 * Finalize current epoch and save it
 */
async function finalizeEpoch() {
    try {
        // Ensure we have valid data
        if (!currentEpoch.startTime || currentEpoch.totalSeconds <= 0) {
            console.warn('Invalid epoch data, skipping finalization');
            startNewEpoch();
            await StorageManager.saveCurrentEpoch(currentEpoch);
            return;
        }

        // Cap active seconds at total (sanity check)
        currentEpoch.activeSeconds = Math.min(
            currentEpoch.activeSeconds,
            currentEpoch.totalSeconds
        );

        // Calculate activity score with bounds (0-100)
        const activityScore = Math.max(0, Math.min(100,
            Math.round((currentEpoch.activeSeconds / currentEpoch.totalSeconds) * 100)
        ));

        // Create epoch object
        const epoch = {
            timestamp: currentEpoch.startTime,
            activityScore: activityScore,
            epochDuration: currentEpoch.epochDuration
        };

        // Save to storage
        await StorageManager.saveActivityEpoch(epoch);

        console.log('Epoch saved:', epoch);

        // Start new epoch
        startNewEpoch();
        await StorageManager.saveCurrentEpoch(currentEpoch);
    } catch (error) {
        console.error('Error finalizing epoch:', error);
        // Start fresh epoch on error
        startNewEpoch();
        await StorageManager.saveCurrentEpoch(currentEpoch);
    }
}

/**
 * Perform sleep/wake cycle analysis
 */
async function performSleepAnalysis() {
    try {
        console.log('Performing sleep analysis...');

        // Get activity data for the last 30 days
        const endDate = Date.now();
        const startDate = endDate - (30 * 24 * 60 * 60 * 1000); // 30 days ago
        const activityData = await StorageManager.getActivityData(startDate, endDate);

        if (activityData.length === 0) {
            console.log('No activity data available for sleep analysis');
            return;
        }

        // Get settings for analysis
        const settings = await StorageManager.getSettings();

        // Perform analysis
        const analysisResult = AnalysisUtils.detectSleepWakeCycles(activityData, settings);

        // Store analysis result
        const analysisRecord = {
            timestamp: Date.now(),
            result: analysisResult
        };

        // Save to storage (using chrome.storage.local for analysis results)
        await chrome.storage.local.set({ lastSleepAnalysis: analysisRecord });

        console.log('Sleep analysis completed:', analysisResult);
    } catch (error) {
        console.error('Error performing sleep analysis:', error);
    }
}

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'activityHeartbeat') {
        await checkIdleState();
    } else if (alarm.name === 'cleanup') {
        // Daily cleanup of old data
        await StorageManager.cleanupOldData();
    } else if (alarm.name === 'sleepAnalysis') {
        // Perform periodic sleep analysis
        await performSleepAnalysis();
    }
});

/**
 * Handle extension installation/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('Browser Actogram: Extension installed');
        await initialize();
    } else if (details.reason === 'update') {
        console.log('Browser Actogram: Extension updated');
        await initialize();
    }
});

/**
 * Handle browser startup
 */
chrome.runtime.onStartup.addListener(async () => {
    console.log('Browser Actogram: Browser started');
    await initialize();
});

/**
 * Handle extension icon click - open in new tab
 */
chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: 'popup.html' });
});

// Track when we're about to unload
self.addEventListener('beforeunload', () => {
    console.log('Service Worker about to unload - saving critical state');
    // Quick save of minimal state
    chrome.storage.local.set({
        lastWorkerUnload: Date.now(),
        workerRestarts: serviceWorkerRestarts
    });
});

// Handle extension suspend more gracefully
chrome.runtime.onSuspend.addListener(() => {
    console.log('Service Worker being suspended - saving pending state');
    // Quick sync of current state
    const stateToSave = {
        lastWorkerSuspend: Date.now(),
        pendingEpoch: currentEpoch,
        pendingTrackingState: trackingState
    };

    // Try to save state (this might not always complete)
    chrome.storage.local.set(stateToSave).catch(error => {
        console.warn('Failed to save state on suspend:', error);
    });
});

// Initialize on script load (for service worker)
initialize();

/**
 * Handle messages from other parts of the extension
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'runSleepAnalysis') {
        // Run sleep analysis
        performSleepAnalysis().then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            console.error('Error running sleep analysis:', error);
            sendResponse({ success: false, error: error.message });
        });

        // Return true to indicate we'll send a response asynchronously
        return true;
    } else if (message.type === 'KEEP_ALIVE') {
        // Just acknowledge keep-alive messages
        sendResponse({ status: 'alive' });
        return false; // Synchronous response
    } else if (message.type === 'WAKE_UP') {
        // Acknowledge wake up message
        console.log('Worker received wake up signal');
        sendResponse({ status: 'awake' });
        return false; // Synchronous response
    }
});
