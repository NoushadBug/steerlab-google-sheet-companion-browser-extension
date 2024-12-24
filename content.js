
/*
/**
 * Get the value of the currently selected cell in Google Sheets.
 * @returns {string} The value of the current cell.
 */
function getCurrentCellValue() {
    var cellValue = document.querySelector('.cell-input').innerText;
    return cellValue.trim();
}

/**
 * Get the index of the currently selected cell in Google Sheets.
 * @returns {string} The index of the current cell (e.g., "A1", "B2").
 */
function getCurrentCellIndex() {
    var cellIndex = document.querySelector(".waffle-name-box").value;
    return cellIndex;
}

/**
 * Set the index of the selected cell in Google Sheets.
 * @param {string|object} cellIndex - The index of the cell to set (e.g., "A1", "B2") or a JSON object { column, row }.
 */
async function setCurrentCellIndex(cellIndex) {
    var inputBox = document.querySelector(".waffle-name-box");

    if (typeof cellIndex === "string") {
        inputBox.value = cellIndex;
    } else if (typeof cellIndex === "object") {
        var column = cellIndex.column || "";
        var row = cellIndex.row || "";
        inputBox.value = column + row;
    }

    // Trigger click event
    var clickEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
    });
    inputBox.dispatchEvent(clickEvent);

    await delay(80); // Delay for smoother execution

    // Trigger enter key event
    var enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        view: window,
        bubbles: true,
        cancelable: true,
    });
    inputBox.dispatchEvent(enterEvent);
}

/**
 * Get the value from a specified cell in Google Sheets and restore the previously selected cell.
 * @param {string|object} cellIndex - The index of the cell to retrieve the value from (e.g., "A1", "B2") or a JSON object { column, row }.
 * @returns {string} The value of the specified cell.
 */
async function getValueFromCell(cellIndex, goPreviousCell = true) {
    if (goPreviousCell) {
        var previousCellIndex = getCurrentCellIndex();
    }

    if (typeof cellIndex === "string") {
        await setCurrentCellIndex(cellIndex);
    } else if (typeof cellIndex === "object") {
        await setCurrentCellIndex(cellIndex.column + cellIndex.row);
    }

    var cellValue = getCurrentCellValue();
    if (goPreviousCell) {
        await setCurrentCellIndex(previousCellIndex);
    }
    return cellValue;
}

async function setCellValue(cellIndex, value, preservePrevCellIndex = true) {
    await setCurrentCellIndex(cellIndex);

    await simulateValueSet(value);
    await simulateValueSet(value);

    if (preservePrevCellIndex) {
        await setCurrentCellIndex(cellIndex);
    }
}

async function simulateValueSet(value) {
    var inputBox = document.querySelector('.cell-input');

    if (inputBox) {
        // Trigger click event
        nonReactive = true;
        var clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        inputBox.dispatchEvent(clickEvent);
        nonReactive = false;

        await delay(80); // Delay for smoother execution

        // Trigger keydown event
        var keydownEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            view: window,
            bubbles: true,
            cancelable: true,
        });
        inputBox.dispatchEvent(keydownEvent);

        // Set the cell value
        inputBox.innerText = value;

        // Trigger input event
        var inputEvent = new Event('input', {
            bubbles: true,
            cancelable: true,
        });
        inputBox.dispatchEvent(inputEvent);

        // Trigger keydown event
        var keydownPress = new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            view: window,
            bubbles: true,
            cancelable: true,
        });
        inputBox.dispatchEvent(keydownPress);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// You can use this for further DOM manipulation or custom behavior
console.log("Google Sheets Sidebar Extension Loaded");


// Listener for incoming messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getCurrentCellIndex") {
        const cellIndex = getCurrentCellIndex();
        sendResponse({ cellIndex });
    }
});