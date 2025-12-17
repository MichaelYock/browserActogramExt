/**
 * Keep-alive script to help prevent service worker from dying during active usage
 */

let keepAliveInterval;

/**
 * Start sending keep-alive messages to the background service worker
 */
function startKeepAlive() {
    // Clear any existing interval
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }

    // Send keep-alive message every 20 seconds
    keepAliveInterval = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }, () => {
            // Ignore errors - just sending keeps worker alive
            // The callback is required for the message to be sent
        });
    }, 20000); // Every 20 seconds
}

/**
 * Stop sending keep-alive messages
 */
function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Export functions for use in other scripts
window.KeepAlive = {
    start: startKeepAlive,
    stop: stopKeepAlive
};