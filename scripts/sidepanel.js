document.addEventListener("DOMContentLoaded", () => {
  const currentCellElement = document.getElementById("currentCell");
  const clearButton = document.getElementById("clearCellIndex");

  function fetchCellIndex() {
    chrome.runtime.sendMessage({ action: "getCurrentCellIndex" }, (response) => {
      if (response) {
        currentCellElement.textContent = response.cellIndex || "N/A";
      }
    });
  }

  // Clear the displayed cell index
  clearButton.addEventListener("click", () => {
    currentCellElement.textContent = "";
  });

  // Fetch the current cell index every second
  setInterval(fetchCellIndex, 1000);
});
