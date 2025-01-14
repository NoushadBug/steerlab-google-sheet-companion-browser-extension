document.addEventListener("DOMContentLoaded", () => {
  const currentCellElement = document.getElementById("currentCell");
  const saveButton = document.getElementById("saveButton");
  let quill;
  let previousCellIndex = null; // Track the previous cell index

  // Initialize Quill Editor
  function initializeQuill() {
    quill = new Quill("#quillEditor", {
      theme: "snow",
      modules: {
        toolbar: [
          [{ font: [] }, { size: [] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ script: "super" }, { script: "sub" }],
          [{ header: "1" }, { header: "2" }, "blockquote", "code-block"],
          [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
          ["direction", { align: [] }],
          ["link", "image", "video", "formula"],
          ["clean"],
        ],
      },
      placeholder: "Edit cell content here...",
    });
  }

  // Fetch current cell index
  function fetchCellIndex() {
    chrome.runtime.sendMessage({ action: "getCurrentCellIndex" }, (response) => {
      if (response) {
        const currentCellIndex = response.cellIndex || "N/A";

        // Check if the cell index has changed
        if (currentCellIndex !== previousCellIndex) {
          previousCellIndex = currentCellIndex; // Update the tracked cell index
          fetchCellContent(); // Fetch content only if the cell index has changed
        }
      }
    });
  }

  // Fetch current cell content from the backend
  function fetchCellContent() {
    chrome.runtime.sendMessage({ action: "getCurrentCellValue" }, (response) => {
      console.log("Fetched cell content:", response);
      if (response && response.cellValue !== undefined) {
        quill.root.innerHTML = response.cellValue || "";
      } else {
        console.error("Failed to fetch cell value:", response);
      }
    });
  }

  // Save Quill content back to the cell
  function saveCellContent() {
    const content = quill.root.innerHTML;
    chrome.runtime.sendMessage(
      { action: "setCellValue", cellValue: content },
      (response) => {
        if (response && response.success) {
          console.log("Cell content saved successfully!");
        } else {
          console.error("Failed to save cell value:", response);
        }
      }
    );
  }

  // Initialize Quill editor on load
  initializeQuill();

  // Save content on button click
  saveButton.addEventListener("click", saveCellContent);

  // Periodically check for cell index changes
  setInterval(fetchCellIndex, 1000);
});
