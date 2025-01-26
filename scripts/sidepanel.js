// Wait for the JSONEditor script to load
document.addEventListener("DOMContentLoaded", () => {
  const saveButton = document.getElementById("saveButton");
  let quill;
  let jsonEditor;
  let previousCellIndex = null; // Track the previous cell index

  // Initialize Quill Editor
  function initializeQuill() {
    const quillContainer = document.getElementById("quillEditor");
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

  // Initialize JSON Editor
  function initializeJsonEditor() {
    const jsonContainer = document.getElementById("jsonEditorContainer");
    const options = {
      mode: "tree",
    };
    jsonEditor = new JSONEditor(jsonContainer, options);
  }

  // Clean editors
  function cleanEditors() {
    if (quill) {
      quill = null;
      document.querySelectorAll(".ql-toolbar").forEach((el) => el.remove());
    }
    if (jsonEditor) {
      jsonEditor.destroy();
      jsonEditor = null;
    }
  }

  // Fetch current cell content from the backend
  function fetchCellContent() {
    chrome.runtime.sendMessage({ action: "getCurrentCellIndex" }, (response) => {
      if (response) {
        const currentCellIndex = response.cellIndex || "N/A";

        // Check if the cell index has changed
        if (currentCellIndex !== previousCellIndex) {
          previousCellIndex = currentCellIndex; // Update the tracked cell index

          chrome.runtime.sendMessage({ action: "getCurrentCellValue" }, (cellResponse) => {
            if (cellResponse && cellResponse.cellValue !== undefined) {
              try {
                const parsedJson = JSON.parse(cellResponse.cellValue);
                activateJsonEditor(parsedJson);
              } catch (e) {
                activateQuill(cellResponse.cellValue);
              }
            } else {
              console.error("Failed to fetch cell value:", cellResponse);
            }
          });
        }
      }
    });
  }

  // Activate Quill Editor
  function activateQuill(content) {
    cleanEditors();
    initializeQuill();
    quill.root.innerHTML = content || "";
    document.getElementById("quillEditor").style.display = "block";
    document.getElementById("jsonEditorContainer").style.display = "none";
  }

  // Activate JSON Editor
  function activateJsonEditor(jsonContent) {
    cleanEditors();
    initializeJsonEditor();
    jsonEditor.set(jsonContent);
    document.getElementById("quillEditor").style.display = "none";
    document.getElementById("jsonEditorContainer").style.display = "block";
  }

  // Save cell content back to the cell
  function saveCellContent() {
    let content;
    if (jsonEditor) {
      content = JSON.stringify(jsonEditor.get(), null, 2);
    } else if (quill) {
      content = quill.root.innerHTML;
    }
    content = content.replace(/(\r\n|\n|\r)/gm, "");
    try {
      content = JSON.stringify(JSON.parse(content));
    } catch (e) {
      // Do nothing
    }
    chrome.runtime.sendMessage(

      { action: "setCellValue", cellValue: content.replace(/(\r\n|\n|\r)/gm, "") },
      (response) => {
        if (response && response.success) {
          console.log("Cell content saved successfully!");
        } else {
          console.error("Failed to save cell value:", response);
        }
      }
    );
  }

  // Save content on button click
  saveButton.addEventListener("click", saveCellContent);

  // Periodically check for cell content changes
  setInterval(fetchCellContent, 1000);
});
