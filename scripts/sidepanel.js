// sidepanel.js

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

  // 1) Scrape all sections
  btnScrape.addEventListener('click', () => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_SECTIONS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error contacting content script:', chrome.runtime.lastError.message);
          return;
        }
        if (!Array.isArray(response)) {
          console.error('[sidepanel.js] Did not receive an array of sections:', response);
          return;
        }

        // Flatten
        flatQuestions = [];
        response.forEach((section, sIdx) => {
          section.questions.forEach((q) => {
            flatQuestions.push({
              ...q,
              sectionIndex: sIdx,
              sectionName: section.sectionName,
              // userAnswer can be string or array, depending on type
              userAnswer: (q.answerType === 'multichoice') ? [] : ''
            });
          });
        });

        renderQuestions(flatQuestions, questionsContainer);
      });
    });
  });

  // 2) Show JSON
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
 * Renders each question. 
 * - For 'button', we show a <select>.
 * - For 'multichoice', we show multiple checkboxes.
 * - For 'input_text', 'rich_text', etc., we keep a textarea.
 */
function renderQuestions(questions, containerEl) {
  containerEl.innerHTML = '';

  questions.forEach((q) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'border rounded p-3 bg-gray-50 mb-2';

    // Title row with "Go to" button
    const titleRow = document.createElement('div');
    titleRow.className = 'flex items-center justify-between mb-2';

    const titleText = document.createElement('div');
    titleText.className = 'font-semibold';
    titleText.textContent = `#${q.questionDisplayNumber}: ${q.questionText}`;

    const btnGoTo = document.createElement('button');
    btnGoTo.className = 'bg-blue-400 text-white px-2 py-1 rounded';
    btnGoTo.textContent = 'Go to';
    btnGoTo.addEventListener('click', () => {
      scrollToQuestion(q);
    });

    titleRow.appendChild(titleText);
    titleRow.appendChild(btnGoTo);
    wrapper.appendChild(titleRow);

    // Meta info
    const meta = document.createElement('div');
    meta.className = 'text-sm text-gray-500 mb-2';
    meta.textContent = `Type: ${q.answerType} | ID: ${q.questionId}`;
    wrapper.appendChild(meta);

    // Decide how to render the "input" area
    let inputContainer;
    if (q.answerType === 'button') {
      // We'll show a <select> for the button options
      inputContainer = document.createElement('select');
      inputContainer.className = 'border rounded p-1 mb-2';
      // We'll fill it after "Grab from Page" (since we learn the buttonOptions then)
    }
    else if (q.answerType === 'multichoice') {
      // We'll create a div that will hold the checkboxes
      inputContainer = document.createElement('div');
      inputContainer.className = 'mb-2 flex flex-col gap-1';
      // We'll fill it after "Grab from Page" (since we need multiChoiceOptions)
    }
    else {
      // For input_text, rich_text, unknown => use a <textarea>
      inputContainer = document.createElement('textarea');
      inputContainer.className = 'w-full border rounded p-1 mb-2';
      inputContainer.setAttribute('rows', '2');
      // Set the initial value
      inputContainer.value = typeof q.userAnswer === 'string' ? q.userAnswer : '';
      inputContainer.addEventListener('input', (e) => {
        q.userAnswer = e.target.value;
      });
    }

    wrapper.appendChild(inputContainer);

    // Button row: Grab / Push
    const btnRow = document.createElement('div');
    btnRow.className = 'flex space-x-2';

    // Grab
    const btnGrab = document.createElement('button');
    btnGrab.textContent = 'Grab from Page';
    btnGrab.className = 'bg-yellow-400 px-2 py-1 rounded';
    btnGrab.addEventListener('click', () => {
      scrollToQuestion(q, (success) => {
        if (!success) {
          console.error('[sidepanel.js] Failed to scroll, not grabbing.');
          return;
        }
        // If scrolling succeeded, then do the "grabQuestionAnswer" part:
        grabQuestionAnswer(q).then((resp) => {
          if (q.answerType === 'button') {
            // Example: { answer: "No", buttonOptions: ["Yes","No"] }
            inputContainer.innerHTML = ''; // clear old <option>
            if (resp.buttonOptions) {
              resp.buttonOptions.forEach(opt => {
                const optionEl = document.createElement('option');
                optionEl.value = opt;
                optionEl.textContent = opt;
                inputContainer.appendChild(optionEl);
              });
            }
            inputContainer.value = resp.answer || '';
            q.userAnswer = resp.answer || '';
          }
          else if (q.answerType === 'multichoice') {
            // Example: { answer: ['Opt1','Opt2'], multiChoiceOptions: ['Opt1','Opt2','Opt3'] }
            inputContainer.innerHTML = ''; // clear old checkboxes
            if (Array.isArray(resp.multiChoiceOptions)) {
              resp.multiChoiceOptions.forEach(opt => {
                const label = document.createElement('label');
                label.className = 'inline-flex items-center space-x-1';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = opt;
                cb.checked = Array.isArray(resp.answer) && resp.answer.includes(opt);

                // Keep local userAnswer updated
                cb.addEventListener('change', () => {
                  if (!Array.isArray(q.userAnswer)) {
                    q.userAnswer = [];
                  }
                  if (cb.checked) {
                    if (!q.userAnswer.includes(opt)) {
                      q.userAnswer.push(opt);
                    }
                  } else {
                    q.userAnswer = q.userAnswer.filter(x => x !== opt);
                  }
                });

                const txtSpan = document.createElement('span');
                txtSpan.textContent = opt;

                label.appendChild(cb);
                label.appendChild(txtSpan);
                inputContainer.appendChild(label);
              });
            }
            // set the initial local userAnswer array
            q.userAnswer = Array.isArray(resp.answer) ? [...resp.answer] : [];
          }
          else {
            // For input_text, rich_text => resp.answer is a string
            inputContainer.value = resp.answer || '';
            q.userAnswer = resp.answer || '';
          }
        });
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

/** Scroll to the question in OneTrust page. */
function scrollToQuestion(q, callback = () => { }) {
  getActiveTabId().then((tabId) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'SCROLL_TO_QUESTION',
      data: q
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[sidepanel.js] scrollToQuestion error:', chrome.runtime.lastError.message);
        callback(false);
      } else {
        console.log('[sidepanel.js] scrollToQuestion result:', response);
        callback(true);
      }
    });
  });
}

/** Grab the current answer (and possible options if 'button' or 'multichoice'). */
function grabQuestionAnswer(question) {
  return new Promise((resolve) => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'GRAB_ANSWER', data: question }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error grabbing question:', chrome.runtime.lastError.message);
          resolve({ answer: '' });
        } else {
          resolve(response || { answer: '' });
        }
      });
    });
  });
}

/** Push the user's selection/answer to OneTrust. */
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

/** Get the active tab. */
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
