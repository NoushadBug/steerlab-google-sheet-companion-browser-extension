chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "selectRange") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ error: "No active tab found" });
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: "getSelectedRange" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error selecting range:", chrome.runtime.lastError.message);
          sendResponse({ error: "Failed to select range" });
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }

  if (request.action === "processAITask") {
    const { inputRange, outputRange } = request;

    if (!inputRange || !outputRange) {
      sendResponse({ error: "Input or output range is missing" });
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ error: "No active tab found" });
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "getRangeValues", range: inputRange },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.values) {
            console.error("Error fetching input range values:", chrome.runtime.lastError?.message);
            sendResponse({ error: "Failed to fetch input range" });
            return;
          }

          const aiResponse = response.values.map((row) =>
            row.map((cell) => `AI Response for ${cell}`)
          );

          chrome.tabs.sendMessage(tabs[0].id, {
            action: "setRangeValues",
            range: outputRange,
            values: aiResponse.flat(),
          });

          sendResponse({ success: true });
        }
      );
    });
    return true;
  }
});
