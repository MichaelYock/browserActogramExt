/**
 * Worker Health Monitoring Utility
 * Helps detect and recover from stuck or dead service workers
 */

/**
 * Check if the background worker is healthy
 * @returns {Promise<boolean>} True if worker is healthy, false otherwise
 */
async function checkWorkerHealth() {
    try {
        const data = await chrome.storage.local.get(['lastHeartbeat']);
        const now = Date.now();
        
        // If we have a heartbeat and it's recent (within 3 minutes), worker is healthy
        if (data.lastHeartbeat && now - data.lastHeartbeat <= 180000) { // 3 minutes
            return true;
        }
        
        // If no recent heartbeat, worker might be stuck
        console.warn('Background worker may be stuck or dead');
        return false;
    } catch (error) {
        console.error('Error checking worker health:', error);
        return false;
    }
}

/**
 * Attempt to wake up a potentially stuck worker
 * @returns {Promise<boolean>} True if wake up attempt was successful
 */
async function wakeUpWorker() {
    try {
        // Send a message to wake up the worker
        await chrome.runtime.sendMessage({ type: 'WAKE_UP' });
        console.log('Sent wake up message to background worker');
        return true;
    } catch (error) {
        console.error('Error waking up worker:', error);
        return false;
    }
}

/**
 * Check worker health and attempt recovery if needed
 * @returns {Promise<boolean>} True if worker is healthy or recovery was successful
 */
async function ensureWorkerHealth() {
    const isHealthy = await checkWorkerHealth();
    
    if (!isHealthy) {
        console.log('Attempting to recover stuck worker...');
        const wakeSuccess = await wakeUpWorker();
        
        if (wakeSuccess) {
            // Give worker time to respond
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check again
            return await checkWorkerHealth();
        }
    }
    
    return isHealthy;
}

// Export functions
window.WorkerHealth = {
    check: checkWorkerHealth,
    wakeUp: wakeUpWorker,
    ensure: ensureWorkerHealth
};