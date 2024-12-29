document.addEventListener("DOMContentLoaded", () => {
  const dropdown = document.getElementById("sheetTabs");
  const currentCellElement = document.getElementById("currentCell");
  const clearButton = document.getElementById("clearCellIndex");

  // Request sheet names
  chrome.runtime.sendMessage({ type: "requestSheetNames" }, (response) => {
    console.log(response);
    if (response && response.sheetNames) {
      populateDropdown(response.sheetNames);
    } else {
      console.error("No sheet names received");
    }
  });

  function populateDropdown(sheetNames) {
    dropdown.innerHTML = ""; // Clear previous options

    const defaultOption = document.createElement("option");
    defaultOption.textContent = "Select a sheet";
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    dropdown.appendChild(defaultOption);

    sheetNames.forEach((sheetName) => {
      const option = document.createElement("option");
      option.value = sheetName;
      option.textContent = sheetName;
      dropdown.appendChild(option);
    });
  }

  dropdown.addEventListener("change", (event) => {
    const selectedSheet = event.target.value;
    chrome.runtime.sendMessage({
      type: "sheetSelected",
      sheetName: selectedSheet,
    });
  });

  function fetchCellIndex() {
    chrome.runtime.sendMessage({ action: "getCurrentCellIndex" }, (response) => {
      if (response) {
        currentCellElement.textContent = response.cellIndex || "N/A";
      }
    });
  }

  clearButton.addEventListener("click", () => {
    currentCellElement.textContent = "";
  });

  setInterval(fetchCellIndex, 1000);
});
