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

  // 1) Scrape all sections (now using SCRAPE_SECTIONS_WITH_ANSWERS)
  btnScrape.addEventListener('click', () => {
    getActiveTabId().then((tabId) => {
      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_SECTIONS_WITH_ANSWERS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[sidepanel.js] Error contacting content script:', chrome.runtime.lastError.message);
          return;
        }
        if (!Array.isArray(response)) {
          console.error('[sidepanel.js] Did not receive an array of sections:', response);
          return;
        }

        // Flatten the returned sections into one array of questions
        flatQuestions = [];
        response.forEach((section, sIdx) => {
          section.questions.forEach((q) => {
            // q.answer might be an object like { answer, multiChoiceOptions, buttonOptions } 
            // depending on your content script's shape. 
            // If your content script merges it differently, adjust here as needed.
            
            // Typically we do:
            //  userAnswer = q.answer.answer (if it's text or array),
            //  multiChoiceOptions = q.answer.multiChoiceOptions, etc.

            // For convenience, let's unify some fields:
            let userAnswer = '';
            let buttonOptions = [];
            let multiChoiceOptions = [];

            if (q.answerType === 'button' && q.answer?.buttonOptions) {
              buttonOptions = q.answer.buttonOptions;
              userAnswer = q.answer.answer || '';
            }
            else if (q.answerType === 'multichoice' && q.answer) {
              multiChoiceOptions = q.answer.multiChoiceOptions || [];
              // 'answer' might be an array
              userAnswer = Array.isArray(q.answer.answer) ? [...q.answer.answer] : [];
            }
            else {
              // input_text, rich_text, or unknown => just store the string in .answer
              userAnswer = (typeof q.answer?.answer === 'string') ? q.answer.answer : '';
            }

            flatQuestions.push({
              ...q,
              // if you want, you can store the entire `q.answer` object somewhere else
              sectionIndex: sIdx,
              sectionName: section.sectionName,
              userAnswer,
              buttonOptions,
              multiChoiceOptions
            });
          });
        });

        // Render (no autoGrabAll step needed anymore!)
        renderQuestions(flatQuestions, questionsContainer);
      });
    });
  });

  // 2) Show JSON in a modal
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
 * Renders each question in the side panel. 
 * (Unchanged from your original, except we rely on the 
 * data that your content script already returned.)
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
    titleText.style.width = '85%';
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
    meta.className = 'text-xm text-gray-500 mb-2';
    meta.textContent = `Type: ${q.answerType} | ID: ${q.questionId}`;
    wrapper.appendChild(meta);

    // Decide how to render the "input" area
    let inputContainer;
    if (q.answerType === 'button') {
      inputContainer = document.createElement('select');
      inputContainer.className = 'border rounded p-1 mb-2';
      if (Array.isArray(q.buttonOptions) && q.buttonOptions.length > 0) {
        q.buttonOptions.forEach(opt => {
          const optionEl = document.createElement('option');
          optionEl.value = opt;
          optionEl.textContent = opt;
          inputContainer.appendChild(optionEl);
        });
        inputContainer.value = q.userAnswer || '';
      }
      inputContainer.addEventListener('change', (e) => {
        q.userAnswer = e.target.value;
      });
    }
    else if (q.answerType === 'multichoice') {
      inputContainer = document.createElement('div');
      inputContainer.className = 'mb-2 flex flex-col gap-1';
      if (Array.isArray(q.multiChoiceOptions) && q.multiChoiceOptions.length > 0) {
        q.multiChoiceOptions.forEach(opt => {
          const label = document.createElement('label');
          label.className = 'inline-flex items-center space-x-1';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = opt;
          if (Array.isArray(q.userAnswer) && q.userAnswer.includes(opt)) {
            cb.checked = true;
          }

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
    }
    else {
      // For input_text, rich_text, unknown => use a <textarea>
      inputContainer = document.createElement('textarea');
      inputContainer.className = 'w-full border rounded p-1 mb-2';
      inputContainer.setAttribute('rows', '2');
      inputContainer.value = (typeof q.userAnswer === 'string') ? q.userAnswer : '';
      inputContainer.addEventListener('input', (e) => {
        q.userAnswer = e.target.value;
      });
    }

    wrapper.appendChild(inputContainer);

    // Button row: "Get Data" / "Set Data"
    const btnRow = document.createElement('div');
    btnRow.className = 'flex space-x-2';

    // Optional "Get Data" button: manually refresh a single question if desired
    const btnGrab = document.createElement('button');
    btnGrab.textContent = 'Get Data';
    btnGrab.className = 'bg-yellow-400 px-2 py-1 rounded';
    btnGrab.addEventListener('click', () => {
      scrollToQuestion(q, (success) => {
        if (!success) {
          console.error('[sidepanel.js] Failed to scroll, not grabbing.');
          return;
        }
        // If scrolling succeeded, re-grab the question
        grabQuestionAnswer(q).then((resp) => {
          if (q.answerType === 'button') {
            inputContainer.innerHTML = '';
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
            inputContainer.innerHTML = '';
            if (Array.isArray(resp.multiChoiceOptions)) {
              resp.multiChoiceOptions.forEach(opt => {
                const label = document.createElement('label');
                label.className = 'inline-flex items-center space-x-1';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = opt;
                cb.checked = Array.isArray(resp.answer) && resp.answer.includes(opt);

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
            q.userAnswer = Array.isArray(resp.answer) ? [...resp.answer] : [];
          }
          else {
            inputContainer.value = resp.answer || '';
            q.userAnswer = resp.answer || '';
          }
        });
      });
    });
    btnRow.appendChild(btnGrab);

    // "Set Data" button
    const btnPush = document.createElement('button');
    btnPush.textContent = 'Set Data';
    btnPush.className = 'bg-green-500 text-white px-2 py-1 rounded';
    btnPush.addEventListener('click', () => {
      scrollToQuestion(q, (success) => {
        if (!success) {
          console.error('[sidepanel.js] Failed to scroll, not pushing answer.');
          return;
        }
        pushQuestionAnswer(q);
      });
    });
    btnRow.appendChild(btnPush);

    wrapper.appendChild(btnRow);
    containerEl.appendChild(wrapper);
  });
}

/** 
 * Scroll to the question in OneTrust page (unchanged).
 */
function scrollToQuestion(q, callback = () => {}) {
  getActiveTabId().then((tabId) => {
    chrome.tabs.sendMessage(tabId, { action: 'SCROLL_TO_QUESTION', data: q }, (response) => {
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

/** 
 * Grab the current answer (and possible options if 'button' or 'multichoice').
 * Remains for manual refreshing a single question if needed.
 */
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

/**
 * Push the user's selection/answer to OneTrust.
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
 * Helper to get the active tab.
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
