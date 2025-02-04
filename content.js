// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, data } = request;

  if (action === 'SCROLL_TO_QUESTION') {
    openSectionAndScroll(data)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('[content.js] Failed to scroll to question:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async
  }

  if (action === 'SCRAPE_SECTIONS') {
    (async () => {
      try {
        const sections = await scrapeSections();
        sendResponse(sections);
      } catch (err) {
        console.error('[content.js] Error scraping sections:', err);
        sendResponse([]);
      }
    })();
    return true; // async
  }

  if (action === 'GRAB_ANSWER') {
    // Data is the question object
    const result = grabAnswerFromDom(data);
    // For 'multichoice', 'button', etc. we return extra info (options).
    sendResponse(result);
    return true;
  }

  if (action === 'PUSH_ANSWER') {
    pushAnswerToDom(data);
    sendResponse({ success: true });
    return true;
  }
});

/** Opens the correct section in OneTrust, waits, then scrolls the question into view. */
async function openSectionAndScroll(question) {
  const secButtons = document.querySelectorAll('.aa-section-list__section button');
  if (question.sectionIndex < secButtons.length) {
    secButtons[question.sectionIndex].click();
    await waitUntilLoaded();
  }

  // Locate by questionText or questionId
  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);

  if (targetNameEl) {
    targetNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    console.warn('[content.js] Could not find question:', question.questionText);
  }
}

/** Waits for .questions-container ot-loading to disappear. */
function waitUntilLoaded(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const interval = 500;

    const check = () => {
      const loadingEls = document.querySelectorAll('.questions-container ot-loading');
      if (loadingEls.length === 0) {
        clearInterval(timerId);
        resolve();
      } else {
        elapsed += interval;
        if (elapsed >= timeoutMs) {
          clearInterval(timerId);
          reject(new Error('Timed out waiting for questions to load.'));
        }
      }
    };

    const timerId = setInterval(check, interval);
    check(); // immediate
  });
}

/** A simple UUID generator (v4-like). */
function generateUUID() {
  let d = new Date().getTime();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    d += performance.now();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Main scraping function. */
async function scrapeSections() {
  const allSections = [];

  const sectionEls = document.querySelectorAll('.aa-section-list__section');
  for (let secIndex = 0; secIndex < sectionEls.length; secIndex++) {
    const secEl = sectionEls[secIndex];
    const secButton = secEl.querySelector('button');
    const secName = secButton ? secButton.textContent.trim() : `Section ${secIndex + 1}`;

    if (secButton) {
      secButton.click();
      try {
        await waitUntilLoaded();
      } catch (err) {
        console.warn('[content.js] Timed out or failed loading section:', err);
      }
    }

    // Gather .aa-question__name
    const questionNameEls = document.querySelectorAll('.aa-question__name');
    const questionsArr = [];

    questionNameEls.forEach((qEl) => {
      const txt = qEl.textContent.trim();
      const container = qEl.closest('.aa-question__container');
      const questionId = generateUUID();

      // Check for question display number
      const numberEl = container.querySelector('.aa-question__number');
      const questionDisplayNumber = numberEl ? numberEl.textContent.trim() : '';

      const answerType = detectAnswerType(container);

      questionsArr.push({
        questionId,
        questionText: txt,
        questionDisplayNumber,
        answerType,
        sectionId: `${secIndex + 1}`
      });
    });

    allSections.push({
      sectionName: secName,
      sectionId: `${secIndex + 1}`,
      questions: questionsArr
    });
  }

  return allSections;
}

/**
 * Classify question type by scanning known elements:
 * - .aa-question__button-row => 'button'
 * - .vt-input-element => 'input_text'
 * - .aa-question__multichoice => 'multichoice'
 * - [ot-rich-text-editor-element] => 'rich_text'
 * default => 'unknown'
 */
function detectAnswerType(containerEl) {
  if (!containerEl) return '';
  if (containerEl.querySelector('.aa-question__button-row')) {
    return 'button';
  }
  if (containerEl.querySelector('.vt-input-element')) {
    return 'input_text';
  }
  if (containerEl.querySelector('.aa-question__multichoice')) {
    return 'multichoice';
  }
  if (containerEl.querySelector('[ot-rich-text-editor-element]')) {
    return 'rich_text';
  }
  return 'unknown';
}

/**
 * Grab the answer from the DOM for a question.
 * If it's 'multichoice', return { answer: [...checked], multiChoiceOptions: [...allPossible] }
 * If it's 'button', return { answer: 'No', buttonOptions: ['Yes','No'] }
 * If it's text => { answer: 'something' }
 */
function grabAnswerFromDom(question) {
  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
  if (!targetNameEl) return { answer: '' };

  const container = targetNameEl.closest('.aa-question__container');
  if (!container) return { answer: '' };

  switch (question.answerType) {
    case 'input_text': {
      const inputEl = container.querySelector('.vt-input-element');
      return { answer: inputEl ? inputEl.value : '' };
    }

    case 'rich_text': {
      const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
      return { answer: ql ? ql.innerHTML : '' };
    }

    case 'multichoice': {
      // Gather all buttons within .aa-question__multichoice
      const multiEl = container.querySelector('.aa-question__multichoice');
      if (!multiEl) return { answer: [], multiChoiceOptions: [] };

      const buttonEls = Array.from(multiEl.querySelectorAll('button'));
      // All possible options: the trimmed text content of each button
      const multiChoiceOptions = buttonEls.map(b => b.textContent.trim());
      // Currently selected options: buttons that have the vt-button--primary class or aria-pressed === "true"
      const checkedVals = buttonEls.filter(b =>
        b.classList.contains('vt-button--primary') || b.getAttribute('aria-pressed') === 'true'
      ).map(b => b.textContent.trim());

      return {
        answer: checkedVals,   // array of strings representing selected options
        multiChoiceOptions     // array of all possible option strings
      };
    }


    case 'button': {
      const buttonRow = container.querySelector('.aa-question__button-row');
      if (!buttonRow) return { answer: '', buttonOptions: [] };

      const btnEls = Array.from(buttonRow.querySelectorAll('.vt-button'));
      const options = [];
      let selectedVal = '';

      btnEls.forEach(b => {
        const txt = b.textContent.trim();
        options.push(txt);

        const isSelected = b.classList.contains('vt-button--primary') ||
          b.getAttribute('aria-pressed') === 'true';
        if (isSelected) {
          selectedVal = txt;
        }
      });

      return { answer: selectedVal, buttonOptions: options };
    }

    default:
      return { answer: '' };
  }
}

/**
 * Push userAnswer into the DOM. 
 * For 'multichoice', userAnswer is an array => we check all that match the array elements.
 * For 'button', we find the single button that matches userAnswer text and click it.
 */
async function pushAnswerToDom(question) {
  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
  if (!targetNameEl) return;

  const container = targetNameEl.closest('.aa-question__container');
  if (!container) return;

  const answer = question.userAnswer || '';

  switch (question.answerType) {
    case 'input_text': {
      const inputEl = container.querySelector('.vt-input-element');
      if (inputEl) {
        inputEl.value = answer;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    }

    case 'rich_text': {
      const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
      if (ql) {
        ql.innerHTML = answer;
        ql.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    }

    case 'multichoice': {
      // answer is an array of strings
      const multiEl = container.querySelector('.aa-question__multichoice');
      if (!multiEl) return;

      const buttonEls = Array.from(multiEl.querySelectorAll('button'));

      // Helper function: Wait until a button is enabled (i.e. not disabled).
      async function waitForButtonEnabled(button, timeout = 10000) {
        return new Promise((resolve, reject) => {
          const interval = 200;
          let elapsed = 0;
          const check = () => {
            if (!button.disabled) {
              resolve();
            } else {
              elapsed += interval;
              if (elapsed >= timeout) {
                reject(new Error("Timeout waiting for button to be enabled"));
              } else {
                setTimeout(check, interval);
              }
            }
          };
          check();
        });
      }

      // Helper function: Ensure the button's state matches the desired state.
      async function ensureButtonState(button, shouldBeSelected, maxAttempts = 10) {
        let attempts = 0;
        while (attempts < maxAttempts) {
          // Wait until the button is enabled for clicking
          await waitForButtonEnabled(button);
          // Check current state:
          const isSelected = button.classList.contains('vt-button--primary') ||
            button.getAttribute('aria-pressed') === 'true';
          if (shouldBeSelected === isSelected) {
            // Button state is as desired. Break out.
            return;
          } else {
            // Click the button to toggle its state
            button.click();
            // Wait a little for backend processing (during which the button may become disabled)
            await new Promise(res => setTimeout(res, 500));
            attempts++;
          }
        }
        // Optionally, you can throw an error if the state could not be set.
        // throw new Error(`Failed to set button state after ${maxAttempts} attempts`);
      }

      // Iterate over each button, ensuring its state is as desired
      for (const button of buttonEls) {
        const btnText = button.textContent.trim();
        // Determine desired state: true if the answer array includes this button's text.
        const shouldBeSelected = Array.isArray(answer) && answer.includes(btnText);
        // Check current state (for informational purposes)
        const isSelected = button.classList.contains('vt-button--primary') ||
          button.getAttribute('aria-pressed') === 'true';
        if (shouldBeSelected !== isSelected) {
          try {
            await ensureButtonState(button, shouldBeSelected);
          } catch (err) {
            console.error("Error ensuring button state for", btnText, err);
          }
        }
      }
      break;
    }



    case 'button': {
      const buttonRow = container.querySelector('.aa-question__button-row');
      if (!buttonRow) return;

      const btnEls = Array.from(buttonRow.querySelectorAll('.vt-button'));
      const btnToClick = btnEls.find(b => b.textContent.trim() === answer);
      if (btnToClick) {
        btnToClick.click();
      } else {
        console.warn('[content.js] No button found matching:', answer);
      }
      break;
    }

    default:
      // unknown => do nothing
      break;
  }
}
