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

  // 1) Scrape all sections (using SCRAPE_SECTIONS_WITH_ANSWERS)
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
            /**
             * q.answer might be single-type or "composed"
             */
            let userAnswer = '';
            let buttonOptions = [];
            let multiChoiceOptions = [];

            if (q.answerType === 'button' && q.answer?.buttonOptions) {
              buttonOptions = q.answer.buttonOptions;
              userAnswer = q.answer.answer || '';
            }
            else if (q.answerType === 'multichoice' && q.answer) {
              multiChoiceOptions = q.answer.multiChoiceOptions || [];
              userAnswer = Array.isArray(q.answer.answer) ? [...q.answer.answer] : [];
            }
            else if (q.answerType === 'composed') {
              // We'll keep subAnswers in q.answer.subAnswers
              // No direct userAnswer here
            }
            else {
              // For input_text, rich_text, or unknown => store string in userAnswer
              userAnswer = (typeof q.answer?.answer === 'string') ? q.answer.answer : '';
            }

            flatQuestions.push({
              ...q,
              sectionIndex: sIdx,
              sectionName: section.sectionName,
              userAnswer,
              buttonOptions,
              multiChoiceOptions
            });
          });
        });

        // Render them in the side panel
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
 * - "button" => single <select>
 * - "multichoice" => multiple checkboxes
 * - "composed" => multiple sub-answers in one card
 * - "input_text", "rich_text", etc. => single <textarea>
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
    let inputContainer = document.createElement('div');
    if (q.answerType === 'unknown') {
    }
    else if (q.answerType === 'button') {
      inputContainer = renderButtonQuestion(q);

    } else if (q.answerType === 'multichoice') {
      inputContainer = renderMultichoiceQuestion(q);

    } else if (q.answerType === 'composed') {
      // We'll handle subAnswers in q.answer.subAnswers
      inputContainer = document.createElement('div');
      inputContainer.className = 'mb-2 flex flex-col gap-2 bg-gray-100 p-2';

      if (q.answer && Array.isArray(q.answer.subAnswers)) {
        q.answer.subAnswers.forEach((sub, idx) => {
          const subBlock = document.createElement('div');
          subBlock.className = 'border p-2 rounded bg-white';

          // Label for sub-block
          const subLabel = document.createElement('div');
          subLabel.className = 'text-sm font-bold mb-1';
          subLabel.textContent = `Composed Part #${idx + 1}: ${sub.type}`;
          subBlock.appendChild(subLabel);

          // Render sub type
          let subEl;
          if (sub.type === 'multichoice') {
            subEl = renderComposedMultiChoice(q, sub);
          } else if (sub.type === 'input_text') {
            subEl = renderComposedInputText(q, sub);
          } else if (sub.type === 'button') {
            subEl = renderComposedButton(q, sub);
          } else if (sub.type === 'rich_text') {
            subEl = renderComposedRichText(q, sub);
          } else {
            subEl = document.createElement('div');
            subEl.className = 'text-red-500 text-sm';
            subEl.textContent = `Unknown sub-type: ${sub.type}`;
          }

          subBlock.appendChild(subEl);
          inputContainer.appendChild(subBlock);
        });
      }
    } else {
      // input_text, rich_text, unknown => single textarea
      inputContainer = renderTextQuestion(q);
    }

    wrapper.appendChild(inputContainer);

    // Button row: "Get Data" / "Set Data"
    const btnRow = document.createElement('div');
    btnRow.className = 'flex space-x-2';

    // "Get Data" (manual refresh)
    const btnGrab = document.createElement('button');
    btnGrab.textContent = 'Get Data';
    btnGrab.className = 'bg-yellow-400 px-2 py-1 rounded';
    btnGrab.addEventListener('click', () => {
      scrollToQuestion(q, (success) => {
        if (!success) {
          console.error('[sidepanel.js] Failed to scroll, not grabbing.');
          return;
        }
        grabQuestionAnswer(q).then((resp) => {
          if (q.answerType === 'composed' && resp.subAnswers) {
            // Overwrite subAnswers
            q.answer.subAnswers = resp.subAnswers;
            // Re-render everything
            renderQuestions(flatQuestions, containerEl);
          }
          else if (q.answerType === 'button') {
            q.buttonOptions = resp.buttonOptions || [];
            q.userAnswer = resp.answer || '';
            renderQuestions(flatQuestions, containerEl);
          }
          else if (q.answerType === 'multichoice') {
            q.multiChoiceOptions = resp.multiChoiceOptions || [];
            q.userAnswer = Array.isArray(resp.answer) ? [...resp.answer] : [];
            renderQuestions(flatQuestions, containerEl);
          }
          else {
            q.userAnswer = resp.answer || '';
            renderQuestions(flatQuestions, containerEl);
          }
        });
      });
    });
    btnRow.appendChild(btnGrab);

    // "Set Data"
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
 * Single-type button question 
 */
function renderButtonQuestion(q) {
  const selectEl = document.createElement('select');
  selectEl.className = 'border rounded p-1 mb-2';

  if (Array.isArray(q.buttonOptions) && q.buttonOptions.length > 0) {
    q.buttonOptions.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      selectEl.appendChild(optionEl);
    });
    selectEl.value = q.userAnswer || '';
  }
  selectEl.addEventListener('change', (e) => {
    q.userAnswer = e.target.value;
  });
  return selectEl;
}

/** 
 * Single-type multichoice question 
 */
function renderMultichoiceQuestion(q) {
  const container = document.createElement('div');
  container.className = 'mb-2 flex flex-col gap-1';

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
      container.appendChild(label);
    });
  }
  return container;
}

/**
 * Single-type text question (input_text, rich_text, or unknown)
 */
function renderTextQuestion(q) {
  const txtArea = document.createElement('textarea');
  txtArea.className = 'w-full border rounded p-1 mb-2';
  txtArea.setAttribute('rows', '2');
  txtArea.value = (typeof q.userAnswer === 'string') ? q.userAnswer : '';
  txtArea.addEventListener('input', (e) => {
    q.userAnswer = e.target.value;
  });
  return txtArea;
}

/**
 * COMPOSED sub-renderers
 */
function renderComposedMultiChoice(q, sub) {
  const container = document.createElement('div');
  container.className = 'mb-2 flex flex-col gap-1';

  if (Array.isArray(sub.multiChoiceOptions)) {
    sub.multiChoiceOptions.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'inline-flex items-center space-x-1';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt;
      if (Array.isArray(sub.answer) && sub.answer.includes(opt)) {
        cb.checked = true;
      }
      cb.addEventListener('change', () => {
        if (!Array.isArray(sub.answer)) {
          sub.answer = [];
        }
        if (cb.checked) {
          if (!sub.answer.includes(opt)) {
            sub.answer.push(opt);
          }
        } else {
          sub.answer = sub.answer.filter(x => x !== opt);
        }
      });

      const txtSpan = document.createElement('span');
      txtSpan.textContent = opt;
      label.appendChild(cb);
      label.appendChild(txtSpan);
      container.appendChild(label);
    });
  }
  return container;
}

function renderComposedInputText(q, sub) {
  const txtArea = document.createElement('textarea');
  txtArea.className = 'border rounded p-1 w-full';
  txtArea.setAttribute('rows', '2');
  txtArea.value = typeof sub.answer === 'string' ? sub.answer : '';
  txtArea.addEventListener('input', (e) => {
    sub.answer = e.target.value;
  });
  return txtArea;
}

function renderComposedButton(q, sub) {
  const selectEl = document.createElement('select');
  selectEl.className = 'border rounded p-1';

  if (Array.isArray(sub.buttonOptions) && sub.buttonOptions.length > 0) {
    sub.buttonOptions.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      selectEl.appendChild(optionEl);
    });
    selectEl.value = sub.answer || '';
  }
  selectEl.addEventListener('change', (e) => {
    sub.answer = e.target.value;
  });
  return selectEl;
}

function renderComposedRichText(q, sub) {
  const txtArea = document.createElement('textarea');
  txtArea.className = 'border rounded p-1 w-full';
  txtArea.setAttribute('rows', '3');
  txtArea.value = typeof sub.answer === 'string' ? sub.answer : '';
  txtArea.addEventListener('input', (e) => {
    sub.answer = e.target.value;
  });
  return txtArea;
}

/**
 * Scroll to the question in OneTrust page.
 */
function scrollToQuestion(q, callback = () => { }) {
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
 * Grab the current answer for a single question if user wants to re-check.
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
