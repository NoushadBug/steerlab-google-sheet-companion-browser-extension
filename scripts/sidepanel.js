let sectionsData = []; // [{ sectionName, sectionId, questions: [...] }, ...]

document.addEventListener('DOMContentLoaded', () => {
  const btnScrape = document.getElementById('btnScrape');
  const btnExpandAll = document.getElementById('btnExpandAll');
  const btnShowJSON = document.getElementById('btnShowJSON');
  const sectionsContainer = document.getElementById('sectionsContainer');

  // The modal elements
  const jsonModal = document.getElementById('jsonModal');
  const jsonOutput = document.getElementById('jsonOutput');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCopyJson = document.getElementById('btnCopyJson');

  // On click, ask content script to scrape all sections
  btnScrape.addEventListener('click', () => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_SECTIONS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error contacting content script:', chrome.runtime.lastError.message);
          return;
        }
        console.log('[sidepanel.js] SCRAPE_SECTIONS response:', response);

        // Validate the response is an array
        if (!Array.isArray(response)) {
          console.error('[sidepanel.js] SCRAPE_SECTIONS did not return an array. Received:', response);
          return;
        }

        // Store it globally
        sectionsData = response;
        // Render them in collapsible sections
        renderSections(sectionsData, sectionsContainer);
      });
    });
  });

  // Toggle expand/collapse all
  btnExpandAll.addEventListener('click', () => {
    const allContents = sectionsContainer.querySelectorAll('.section-content');
    allContents.forEach((sec) => {
      sec.classList.toggle('hidden');
    });
  });

  // Show the JSON in a modal popup
  btnShowJSON.addEventListener('click', () => {
    // Convert sectionsData to a pretty-printed JSON string
    const jsonString = JSON.stringify(sectionsData, null, 2);
    jsonOutput.textContent = jsonString;
    // Display the modal
    jsonModal.style.display = 'flex';
  });

  // Close the modal
  btnCloseModal.addEventListener('click', () => {
    jsonModal.style.display = 'none';
  });

  // Copy the JSON from the <pre> to the clipboard
  btnCopyJson.addEventListener('click', () => {
    // read directly from jsonOutput.textContent
    const textToCopy = jsonOutput.textContent;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        console.log('[sidepanel.js] JSON copied to clipboard!');
        // Optionally show a small notification or toast
      })
      .catch(err => {
        console.error('[sidepanel.js] Failed to copy JSON:', err);
      });
  });
});

/**
 * Renders the entire sections/questions list in a collapsible format.
 */
function renderSections(sections, containerEl) {
  containerEl.innerHTML = ''; // Clear old data

  sections.forEach((section) => {
    // Create a wrapper for the section
    const sectionWrapper = document.createElement('div');
    sectionWrapper.classList.add('mb-2');

    // Create a clickable header for the section
    const header = document.createElement('div');
    header.className = 'section-header font-semibold';
    header.textContent = section.sectionName + (section.sectionId ? ` (ID: ${section.sectionId})` : '');

    // The content area is hidden by default
    const content = document.createElement('div');
    content.className = 'section-content hidden';

    header.addEventListener('click', () => {
      content.classList.toggle('hidden');
    });

    // For each question, render a "card"
    section.questions.forEach((q) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'question-item border rounded p-2 mb-2';

      // Title
      const qTitle = document.createElement('p');
      qTitle.innerHTML = `<strong>${q.questionText}</strong> (SecID: ${q.sectionId}, QID: ${q.questionId})`;
      qDiv.appendChild(qTitle);

      // Show metadata (answer type, etc.) if present
      if (q.answerType) {
        const metaP = document.createElement('p');
        metaP.textContent = `Answer Type: ${q.answerType}`;
        metaP.classList.add('text-sm', 'text-gray-600', 'mb-1');
        qDiv.appendChild(metaP);
      }

      // Textarea or input for the user's typed answer
      const inputEl = document.createElement('textarea');
      inputEl.classList.add('w-full', 'border', 'rounded', 'p-1', 'mb-2');
      inputEl.setAttribute('rows', '2');
      inputEl.value = q.userAnswer || '';
      inputEl.addEventListener('input', (e) => {
        // keep it in memory so we can push it later
        q.userAnswer = e.target.value;
      });
      qDiv.appendChild(inputEl);

      // Button row
      const btnRow = document.createElement('div');
      btnRow.classList.add('space-x-2');

      // "Grab from Page"
      const btnGrab = document.createElement('button');
      btnGrab.textContent = 'Grab from Page';
      btnGrab.className = 'bg-yellow-400 px-2 py-1 rounded';
      btnGrab.addEventListener('click', () => {
        grabQuestionAnswer(q).then((answerFromDom) => {
          q.userAnswer = answerFromDom;
          inputEl.value = answerFromDom;
        });
      });
      btnRow.appendChild(btnGrab);

      // "Push to Page"
      const btnPush = document.createElement('button');
      btnPush.textContent = 'Push to Page';
      btnPush.className = 'bg-green-500 text-white px-2 py-1 rounded';
      btnPush.addEventListener('click', () => {
        pushQuestionAnswer(q);
      });
      btnRow.appendChild(btnPush);

      qDiv.appendChild(btnRow);
      content.appendChild(qDiv);
    });

    sectionWrapper.appendChild(header);
    sectionWrapper.appendChild(content);
    containerEl.appendChild(sectionWrapper);
  });
}

/**
 * Reads the current answer in the DOM for a specific question (via content script).
 */
function grabQuestionAnswer(question) {
  return new Promise((resolve) => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'GRAB_ANSWER', data: question }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error grabbing question answer:', chrome.runtime.lastError.message);
          resolve('');
        } else {
          resolve(response?.answer || '');
        }
      });
    });
  });
}

/**
 * Fills the DOM’s input fields for this question with the userAnswer (via content script).
 */
function pushQuestionAnswer(question) {
  getActiveTabId().then((tabId) => {
    chrome.tabs.sendMessage(tabId, { action: 'PUSH_ANSWER', data: question }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error pushing question answer:', chrome.runtime.lastError.message);
      } else {
        console.log('Push done:', response);
      }
    });
  });
}

/** 
 * Helper to get the active tab ID (so we can message the content script). 
 */
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        console.error('[sidepanel.js] No active tabs found.');
        resolve(null);
      } else {
        resolve(tabs[0].id);
      }
    });
  });
}
