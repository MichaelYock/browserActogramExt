🔍 Minor Optimizations & Edge Cases:
1. Gap Epoch Duration Calculation
javascript
// Current:
epochDuration: Math.round((endTime - startTime) / (60 * 1000))

// Consider: Ensure minimum duration
const gapDurationMinutes = Math.max(1, Math.round((endTime - startTime) / (60 * 1000)));
Gap epochs shorter than 1 minute might not be meaningful.

2. State Restoration on Long Gaps
When restoring from a long gap, consider preserving the last known state:

javascript
if (elapsedMs > MAX_TRUSTED_GAP_MS) {
    await createGapEpoch(trackingState.lastCheckTime, now);
    
    // Query current state after gap instead of assuming continuation
    const currentState = await getBrowserState();
    trackingState.lastState = currentState; // Update to actual current state
    
    trackingState.lastCheckTime = now;
    await StorageManager.saveTrackingState(trackingState);
    return;
}
3. Alarm Creation Race Condition
When initialize() runs multiple times (onStartup + onInstalled), you might create duplicate alarms:

javascript
// Add check before creating alarms
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

// Call ensureAlarms() instead of direct create in initialize()
4. Memory Optimization for Long Sessions
Consider periodically trimming in-memory state:

javascript
// Add to updateActivityWithCheckpoint():
if (currentEpoch.totalSeconds > 3600) { // After 1 hour of accumulation
    await StorageManager.saveCurrentEpoch(currentEpoch);
    // Optionally: Reset in-memory counters but keep startTime
    // currentEpoch.activeSeconds = 0;
    // currentEpoch.totalSeconds = 0;
}
5. Handle Extension Unload More Gracefully
javascript
// Current beforeunload might not fire reliably in Chrome
// Add storage sync on visibility change:
chrome.runtime.onSuspend.addListener(() => {
    console.log('Service Worker being suspended');
    // Quick sync of current state
    chrome.storage.local.set({
        lastWorkerSuspend: Date.now(),
        pendingEpoch: currentEpoch
    });
});

⚡ One Final Performance Tip:
Consider adding a heartbeat timestamp to quickly detect stale workers:

javascript
// In checkIdleState():
await chrome.storage.local.set({ 
    lastHeartbeat: Date.now() 
});

// In popup or monitoring script:
async function checkWorkerHealth() {
    const data = await chrome.storage.local.get(['lastHeartbeat']);
    const now = Date.now();
    if (data.lastHeartbeat && now - data.lastHeartbeat > 180000) { // 3 minutes
        console.warn('Background worker may be stuck');
        // Optionally send a message to wake it up
        chrome.runtime.sendMessage({ type: 'WAKE_UP' });
    }
}