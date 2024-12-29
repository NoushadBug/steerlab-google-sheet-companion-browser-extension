chrome.runtime.onInstalled.addListener(() => {
  // Set up behavior to open the side panel on clicking the extension icon
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch((error) => console.error('Error setting panel behavior:', error));
});

// Listen for URL updates and enable side panel only for Google Sheets
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;

  const url = new URL(tab.url);
  if (url.hostname === "docs.google.com" && url.pathname.startsWith("/spreadsheets")) {
    // Enable side panel for Google Sheets
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    // Disable the side panel on all other sites
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "sheetSelected") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, message);
      });
  }

  if (message.type === "requestSheetNames") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, { type: "getSheetNames" }, (response) => {
              sendResponse(response);
          });
      });
      return true; // Keep the channel open for async response
  }

  if (message.action === "getCurrentCellIndex") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: "getCurrentCellIndex" }, (response) => {
              sendResponse(response);
          });
      });
      return true; // Keep the channel open for async response
  }
});

