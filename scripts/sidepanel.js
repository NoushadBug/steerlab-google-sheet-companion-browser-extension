let flatQuestions = [];

document.addEventListener('DOMContentLoaded', () => {
  const btnScrape = document.getElementById('btnScrape');
  const btnShowJSON = document.getElementById('btnShowJSON');
  const questionsContainer = document.getElementById('questionsContainer');

  // Modal elements
  const jsonModal = document.getElementById('jsonModal');
  const jsonOutput = document.getElementById('jsonOutput');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCopyJson = document.getElementById('btnCopyJson');

  // Click: Scrape all sections
  btnScrape.addEventListener('click', () => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_SECTIONS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error contacting content script:', chrome.runtime.lastError.message);
          return;
        }
        console.log('[sidepanel.js] SCRAPE_SECTIONS response:', response);

        if (!Array.isArray(response)) {
          console.error('[sidepanel.js] Did not receive an array of sections:', response);
          return;
        }

        // Flatten the data
        flatQuestions = [];
        response.forEach((section, sIdx) => {
          section.questions.forEach((q) => {
            flatQuestions.push({
              ...q,
              sectionIndex: sIdx,             // for opening correct section
              sectionName: section.sectionName,
              userAnswer: ''                  // local text area
            });
          });
        });

        renderQuestions(flatQuestions, questionsContainer);
      });
    });
  });

  // Show JSON
  btnShowJSON.addEventListener('click', () => {
    const jsonStr = JSON.stringify(flatQuestions, null, 2);
    jsonOutput.textContent = jsonStr;
    jsonModal.style.display = 'flex';
  });

  // Close modal
  btnCloseModal.addEventListener('click', () => {
    jsonModal.style.display = 'none';
  });

  // Copy JSON
  btnCopyJson.addEventListener('click', () => {
    const textToCopy = jsonOutput.textContent || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy)
      .then(() => console.log('[sidepanel.js] JSON copied to clipboard!'))
      .catch(err => console.error('[sidepanel.js] Copy failed:', err));
  });
});

/**
 * Renders the entire question list in a flat format. 
 * Each question has:
 * - A "Go to" button (or clickable text) to open/scroll in OneTrust
 * - A textarea for the local userAnswer
 * - "Grab from Page" / "Push to Page" buttons
 */
function renderQuestions(questions, containerEl) {
  containerEl.innerHTML = '';

  questions.forEach((q, i) => {
    // Wrapper for each question
    const wrapper = document.createElement('div');
    wrapper.className = 'border rounded p-3 bg-gray-50';

    // Title row with a "Go to" button
    const titleRow = document.createElement('div');
    titleRow.className = 'flex items-center justify-between mb-2';

    const titleText = document.createElement('div');
    titleText.className = 'font-semibold';
    titleText.textContent = `Q${q.questionDisplayNumber}: ${q.questionText}`;

    // "Go To" button
    const btnGoTo = document.createElement('button');
    btnGoTo.className = 'bg-blue-400 text-white px-2 py-1 rounded';
    btnGoTo.textContent = 'Go to';
    btnGoTo.addEventListener('click', () => {
      scrollToQuestion(q);
    });

    titleRow.appendChild(titleText);
    titleRow.appendChild(btnGoTo);
    wrapper.appendChild(titleRow);

    // Show section name or questionId if you like
    const meta = document.createElement('div');
    meta.className = 'text-sm text-gray-500 mb-2';
    meta.textContent = `Section: ${q.sectionName} | ID: ${q.questionId} | Type: ${q.answerType || 'N/A'}`;
    wrapper.appendChild(meta);

    // Textarea for the user's typed answer
    const inputEl = document.createElement('textarea');
    inputEl.className = 'w-full border rounded p-1 mb-2';
    inputEl.setAttribute('rows', '2');
    inputEl.value = q.userAnswer || '';
    inputEl.addEventListener('input', (e) => {
      q.userAnswer = e.target.value;
    });
    wrapper.appendChild(inputEl);

    // Button row: "Grab" / "Push"
    const btnRow = document.createElement('div');
    btnRow.className = 'flex space-x-2';

    // Grab
    const btnGrab = document.createElement('button');
    btnGrab.textContent = 'Grab from Page';
    btnGrab.className = 'bg-yellow-400 px-2 py-1 rounded';
    btnGrab.addEventListener('click', () => {
      grabQuestionAnswer(q).then(answer => {
        q.userAnswer = answer;
        inputEl.value = answer;
      });
    });
    btnRow.appendChild(btnGrab);

    // Push
    const btnPush = document.createElement('button');
    btnPush.textContent = 'Push to Page';
    btnPush.className = 'bg-green-500 text-white px-2 py-1 rounded';
    btnPush.addEventListener('click', () => {
      pushQuestionAnswer(q);
    });
    btnRow.appendChild(btnPush);

    wrapper.appendChild(btnRow);
    containerEl.appendChild(wrapper);
  });
}

/** 
 * Tells the content script to expand the relevant section and scroll to the question. 
 */
function scrollToQuestion(q) {
  getActiveTabId().then((tabId) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'SCROLL_TO_QUESTION',
      data: q
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[sidepanel.js] SCROLL_TO_QUESTION error:', chrome.runtime.lastError.message);
      } else {
        console.log('[sidepanel.js] SCROLL_TO_QUESTION result:', response);
      }
    });
  });
}

/** 
 * Grab the current answer in the DOM for a specific question. 
 */
function grabQuestionAnswer(question) {
  return new Promise((resolve) => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'GRAB_ANSWER', data: question }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error grabbing question:', chrome.runtime.lastError.message);
          resolve('');
        } else {
          resolve(response?.answer || '');
        }
      });
    });
  });
}

/** 
 * Push the userAnswer to the OneTrust page for this question. 
 */
function pushQuestionAnswer(question) {
  getActiveTabId().then((tabId) => {
    chrome.tabs.sendMessage(tabId, { action: 'PUSH_ANSWER', data: question }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[sidepanel.js] Error pushing answer:', chrome.runtime.lastError.message);
      } else {
        console.log('[sidepanel.js] Pushed answer:', response);
      }
    });
  });
}

/** 
 * Helper to get the active tab ID. 
 */
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        console.error('[sidepanel.js] No active tab found.');
        resolve(null);
      } else {
        resolve(tabs[0].id);
      }
    });
  });
}
