document.addEventListener("DOMContentLoaded", () => {
  const dropdown = document.getElementById("sheetTabs");
  const currentCellElement = document.getElementById("currentCell");
  const clearButton = document.getElementById("clearCellIndex");

  // Function to send a message to content.js to get the dropdown list
  async function fetchDropdownList(range) {
    console.log(range);

    chrome.runtime.sendMessage(
      { type: "getDropdownListByRange", range: range },
      function (response) {
        console.log(JSON.stringify(response));
        // When the response is received, update the dropdown list in the sidebar
        updateDropdownList(response);
      }
    );
  }

  // Function to update the dropdown list in the sidebar
  function updateDropdownList(ddList) {
    const dropdownListElement = document.getElementById('dropdownList');
    dropdownListElement.innerHTML = ''; // Clear the list before adding new items
    ddList.forEach(item => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      dropdownListElement.appendChild(listItem);
    });
  }

  // Event listener for the "Get Dropdown List" button
  document.getElementById('getDropdownListButton').addEventListener('click', function () {
    const range = document.getElementById('currentCell').textContent; // Get current cell or default to 'A1'
    fetchDropdownList(range);
  });

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
