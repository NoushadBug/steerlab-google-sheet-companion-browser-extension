document.addEventListener("DOMContentLoaded", () => {
  const inputRangeElement = document.getElementById("inputRange");
  const outputRangeElement = document.getElementById("outputRange");
  const selectInputRangeButton = document.getElementById("selectInputRange");
  const selectOutputRangeButton = document.getElementById("selectOutputRange");
  const processButton = document.getElementById("processRanges");
  const clearButton = document.getElementById("clearRanges");

  // Function to handle range selection
  function selectRange(rangeElement) {
    chrome.runtime.sendMessage({ action: "selectRange" }, (response) => {
      if (response) {
        rangeElement.value = response.range || "N/A";
      }
    });
  }

  // Select input range
  selectInputRangeButton.addEventListener("click", () => {
    selectRange(inputRangeElement);
  });

  // Select output range
  selectOutputRangeButton.addEventListener("click", () => {
    selectRange(outputRangeElement);
  });

  // Process AI Task
  processButton.addEventListener("click", () => {
    const inputRange = inputRangeElement.value;
    const outputRange = outputRangeElement.value;

    if (!inputRange || !outputRange) {
      alert("Please select both input and output ranges.");
      return;
    }

    chrome.runtime.sendMessage(
      { action: "processAITask", inputRange, outputRange },
      (response) => {
        if (response && response.success) {
          alert("AI processing complete. Check the output range for results.");
        } else {
          alert("Failed to process the AI task.");
        }
      }
    );
  });

  // Clear the ranges
  clearButton.addEventListener("click", () => {
    inputRangeElement.value = "";
    outputRangeElement.value = "";
  });
});
