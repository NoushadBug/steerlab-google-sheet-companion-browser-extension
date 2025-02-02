chrome.runtime.onInstalled.addListener(() => {
  // Set up behavior to open the side panel on clicking the extension icon
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch((error) => console.error('Error setting panel behavior:', error));
});

// service-worker.js

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] Extension installed or updated.');
});

/**
 * Listen for messages from sidepanel.js (or any other part of the extension).
 * We'll validate the incoming requests and optionally forward them to the content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, data } = request;
  console.log('[Service Worker] Received message:', action, data);

  // We can confirm we have a valid tab context if needed
  const tabId = sender.tab ? sender.tab.id : null;

  // Validate action & data
  const validationError = validateRequest(action, data);
  if (validationError) {
    // Return validation error without forwarding to content script
    sendResponse({ success: false, error: validationError });
    return true;
  }

  // If there's no tabId, we can't forward to the content script
  if (!tabId) {
    sendResponse({ success: false, error: 'No active tab found to handle the request.' });
    return true;
  }

  // Forward recognized actions to the content script
  if (['SCRAPE_SECTIONS', 'GRAB_ANSWER', 'PUSH_ANSWER'].includes(action)) {
    chrome.tabs.sendMessage(tabId, { action, data }, (response) => {
      // Relay the content script’s response
      if (chrome.runtime.lastError) {
        console.error('[Service Worker] Error sending message to content script:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
    // Keep the message channel open for the async response
    return true;
  } else {
    // Should not reach here if validations pass, but just in case
    sendResponse({ success: false, error: `Unrecognized action: ${action}` });
    return true;
  }
});


/**
 * Basic validation function that checks if the request is known
 * and whether the data object contains the required fields.
 */
function validateRequest(action, data) {
  // 1. Check if action is recognized
  const allowedActions = ['SCRAPE_SECTIONS', 'GRAB_ANSWER', 'PUSH_ANSWER'];
  if (!allowedActions.includes(action)) {
    return `Invalid action: "${action}". Allowed: ${allowedActions.join(', ')}.`;
  }

  // 2. Validate data fields for each action
  switch (action) {
    case 'SCRAPE_SECTIONS':
      // Typically no data needed to scrape
      // but if you require a certain flag or format, check it here
      // Example: if (data && data.someFlag !== true) { return 'Missing or invalid someFlag for SCRAPE_SECTIONS.'; }
      break;

    case 'GRAB_ANSWER':
      // We expect "data" to have at least a questionText or questionId
      if (!data || typeof data !== 'object') {
        return 'GRAB_ANSWER requires a data object with question details.';
      }
      if (!data.questionText) {
        return 'GRAB_ANSWER missing "questionText" in data.';
      }
      break;

    case 'PUSH_ANSWER':
      // We expect "data" to have questionText and userAnswer
      if (!data || typeof data !== 'object') {
        return 'PUSH_ANSWER requires a data object with question details.';
      }
      if (!data.questionText) {
        return 'PUSH_ANSWER missing "questionText" in data.';
      }
      if (typeof data.userAnswer === 'undefined') {
        return 'PUSH_ANSWER missing "userAnswer" in data.';
      }
      break;

    default:
      // Not strictly necessary since we checked allowedActions above
      return `Action "${action}" is not recognized by validateRequest.`;
  }

  return null; // No validation error
}
