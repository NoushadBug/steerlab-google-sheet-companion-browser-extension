
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
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     if (request.action === "getCurrentCellIndex") {
//         const cellIndex = getCurrentCellIndex();
//         sendResponse({ cellIndex });
//     }
// });

// Utility to parse a range string like "A1:B10" into row and column indices
function parseRange(range) {
    const [startCell, endCell] = range.split(":");
    const startRow = Number(startCell.slice(1)) - 1;
    const endRow = Number(endCell.slice(1)) - 1;
    const startColumn = startCell.charCodeAt(0) - 64;
    const endColumn = endCell.charCodeAt(0) - 64;

    return { startRow, endRow, startColumn, endColumn };
}

// Utility to validate a range
function isValidRange(range) {
    return /^[A-Z]+\d+:[A-Z]+\d+$/.test(range);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            if (request.action === "getSelectedRange") {
                const currentRange = await getCurrentCellIndex(); // Await the async function
                sendResponse({ range: currentRange || "N/A" });
            }

            if (request.action === "getRangeValues") {
                const range = request.range;

                if (!isValidRange(range)) {
                    sendResponse({ error: "Invalid range format" });
                    return;
                }

                const { startRow, endRow, startColumn, endColumn } = parseRange(range);
                const values = [];

                for (let row = startRow; row <= endRow; row++) {
                    const rowValues = [];
                    for (let col = startColumn; col <= endColumn; col++) {
                        const cellIndex = String.fromCharCode(col + 64) + (row + 1);
                        await setCurrentCellIndex(cellIndex); // Await the async function
                        const cellValue = await getCurrentCellValue(); // Await the async function
                        rowValues.push(cellValue);
                    }
                    values.push(rowValues);
                }

                sendResponse({ values });
            }

            if (request.action === "setRangeValues") {
                const { range, values } = request;

                if (!isValidRange(range)) {
                    sendResponse({ error: "Invalid range format" });
                    return;
                }

                const { startRow, endRow, startColumn, endColumn } = parseRange(range);
                let valueIndex = 0;

                for (let row = startRow; row <= endRow; row++) {
                    for (let col = startColumn; col <= endColumn; col++) {
                        const cellIndex = String.fromCharCode(col + 64) + (row + 1);
                        await setCellValue(cellIndex, values[valueIndex], false); // Await the async function
                        valueIndex++;
                    }
                }

                sendResponse({ success: true });
            }
        } catch (error) {
            console.error("Error handling request:", error);
            sendResponse({ error: "An error occurred" });
        }
    })();

    return true; // Keep the listener open for asynchronous responses
});
