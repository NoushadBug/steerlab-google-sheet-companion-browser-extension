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

  if (action === 'SCRAPE_SECTIONS_WITH_ANSWERS') {
    (async () => {
      try {
        const sectionsWithAnswers = await scrapeSectionsWithAnswers();
        sendResponse(sectionsWithAnswers);
      } catch (err) {
        console.error('[content.js] Error scraping sections with answers:', err);
        sendResponse([]);
      }
    })();
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

/** 
 * Main scraping function that also grabs answers. 
 * If a question container has multiple known types => label as "composed". 
 */
async function scrapeSectionsWithAnswers() {
  const allSections = [];

  const sectionEls = document.querySelectorAll('.aa-section-list__section');
  for (let secIndex = 0; secIndex < sectionEls.length; secIndex++) {
    const secEl = sectionEls[secIndex];
    const secButton = secEl.querySelector('button');
    const secName = secButton ? secButton.textContent.trim() : `Section ${secIndex + 1}`;

    // Open the section & wait
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

      // question display number
      const numberEl = container.querySelector('.aa-question__number');
      const questionDisplayNumber = numberEl ? numberEl.textContent.trim() : '';

      const answerType = detectAnswerType(container);
      const answer = grabAnswerFromContainer(container, answerType);

      questionsArr.push({
        questionId,
        questionText: txt,
        questionDisplayNumber,
        answerType,
        sectionId: `${secIndex + 1}`,
        answer  // e.g. { answer: '...' } or { subAnswers: [...] } if composed
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
 * Scraping function without grabbing answers (if needed).
 */
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

    const questionNameEls = document.querySelectorAll('.aa-question__name');
    const questionsArr = [];

    questionNameEls.forEach((qEl) => {
      const txt = qEl.textContent.trim();
      const container = qEl.closest('.aa-question__container');
      const questionId = generateUUID();

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
 * If multiple input types are found => "composed".
 */
function detectAnswerType(containerEl) {
  if (!containerEl) return 'unknown';

  var foundTypes = [];

  if (containerEl.querySelector('.aa-question__multichoice')) {
    foundTypes.push('multichoice');
  }
  if (containerEl.querySelector('.aa-question__button button')) {
    const allBtns = containerEl.querySelectorAll('.aa-question__button button');
    const notMultichoiceBtns = [...allBtns].filter(b => !b.closest('.aa-question__multichoice'));

    console.log('allBtns:', allBtns);
    console.log('notMultichoiceBtns:', notMultichoiceBtns);

    if (notMultichoiceBtns.length > 0) {
      foundTypes.push('button');
    }
  }

  if (containerEl.querySelector('.vt-input-element')) {
    foundTypes.push('input_text');
  }
  if (containerEl.querySelector('[ot-rich-text-editor-element]')) {
    foundTypes.push('rich_text');
  }

  // ADJUSTMENTS
  // Example: if you detect a .aa-question__multichoice but it has no children => remove 'multichoice'
  if (
    foundTypes.includes('multichoice') &&
    containerEl.querySelector('.aa-question__multichoice')?.children.length === 0
  ) {
    foundTypes.splice(foundTypes.indexOf('multichoice'), 1);
  } if (foundTypes.includes('multichoice')) {
    foundTypes = foundTypes.filter(t => t !== 'button'); // Remove 'button' if 'multichoice' exists
  }
  // ADJUSTMENTS END

  if (foundTypes.length === 0) {
    return 'unknown';
  }
  if (foundTypes.length === 1) {
    return foundTypes[0];
  }
  return 'composed';
}

/**
 * Grab answer from container based on answerType.
 */
function grabAnswerFromContainer(container, answerType) {
  switch (answerType) {
    case 'input_text': return grabInputText(container);
    case 'rich_text': return grabRichText(container);
    case 'multichoice': return grabMultiChoice(container);
    case 'button': return grabButton(container);
    case 'composed': return grabComposed(container);
    default: return { answer: '' };
  }
}

function grabInputText(container) {
  const inputEl = container.querySelector('.vt-input-element');
  return { answer: inputEl ? inputEl.value : '' };
}

function grabRichText(container) {
  const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
  return { answer: ql ? ql.innerHTML : '' };
}

function grabMultiChoice(container) {
  const multiEl = container.querySelector('.aa-question__multichoice');
  if (!multiEl) return { answer: [], multiChoiceOptions: [] };

  const buttonEls = Array.from(multiEl.querySelectorAll('.aa-question__button button'));
  const multiChoiceOptions = buttonEls.map(b => b.textContent.trim());
  const checkedVals = buttonEls
    .filter(b => b.classList.contains('vt-button--primary') || b.getAttribute('aria-pressed') === 'true')
    .map(b => b.textContent.trim());

  return {
    answer: checkedVals,
    multiChoiceOptions
  };
}

function grabButton(container) {
  const buttonRow = container.querySelector('.aa-question__button-row');
  if (!buttonRow) return { answer: '', buttonOptions: [] };

  const btnEls = Array.from(buttonRow.querySelectorAll('.aa-question__button button'));
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

/**
 * "composed" => subAnswers array
 */
function grabComposed(container) {
  const subAnswers = [];

  // If container has a multichoice
  if (container.querySelector('.aa-question__multichoice')) {
    subAnswers.push({
      type: 'multichoice',
      ...grabMultiChoice(container)
    });
  }
  // If container has an input_text
  if (container.querySelector('.vt-input-element')) {
    subAnswers.push({
      type: 'input_text',
      ...grabInputText(container)
    });
  }
  // If container has a button row
  if (container.querySelector('.aa-question__button button')) {
    const allBtns = container.querySelectorAll('.aa-question__button button');
    const notMultichoiceBtns = [...allBtns].filter(
      b => !b.closest('.aa-question__multichoice')
    );
    if (notMultichoiceBtns.length > 0) {
      subAnswers.push({
        type: 'button',
        ...grabButton(container)
      });
    }

  }
  // If container has a rich_text
  if (container.querySelector('[ot-rich-text-editor-element] .ql-editor')) {
    subAnswers.push({
      type: 'rich_text',
      ...grabRichText(container)
    });
  }

  return { subAnswers };
}

/**
 * Grab the answer from the DOM for a single question object.
 */
function grabAnswerFromDom(question) {
  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
  if (!targetNameEl) return { answer: '' };

  const container = targetNameEl.closest('.aa-question__container');
  if (!container) return { answer: '' };

  return grabAnswerFromContainer(container, question.answerType);
}

/** 
 * Push userAnswer into the DOM. 
 * If you need to push subAnswers for "composed," you can expand this logic further.
 */
/**
 * Push userAnswer into the DOM. 
 * - If question.answerType is "composed", iterate over subAnswers and push each.
 */
async function pushAnswerToDom(question) {
  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
  if (!targetNameEl) return;

  const container = targetNameEl.closest('.aa-question__container');
  if (!container) return;

  // For simple question types, we read from question.userAnswer.
  // For composed, we read from question.answer.subAnswers.
  if (question.answerType === 'composed') {
    // If the question has subAnswers, push each sub-answer individually
    if (question.answer && Array.isArray(question.answer.subAnswers)) {
      for (const sub of question.answer.subAnswers) {
        await pushSubAnswer(container, sub);
      }
    }
    return; // Done
  }

  // Otherwise, push the single-type userAnswer
  const answer = question.userAnswer || '';

  switch (question.answerType) {
    case 'input_text':
      pushInputText(container, answer);
      break;

    case 'rich_text':
      pushRichText(container, answer);
      break;

    case 'multichoice':
      await pushMultichoice(container, answer);
      break;

    case 'button':
      pushButton(container, answer);
      break;

    default:
      // unknown => do nothing
      break;
  }
}

/** 
 * A helper for pushing subAnswers in a composed question. 
 * sub = { type: 'input_text'|'multichoice'|'button'|'rich_text', ...the relevant data... } 
 */
async function pushSubAnswer(container, sub) {
  switch (sub.type) {
    case 'input_text':
      pushInputText(container, sub.answer || '');
      break;

    case 'rich_text':
      pushRichText(container, sub.answer || '');
      break;

    case 'multichoice':
      await pushMultichoice(container, sub.answer || []);
      break;

    case 'button':
      pushButton(container, sub.answer || '');
      break;

    default:
      console.warn('[content.js] pushSubAnswer: unknown sub.type:', sub.type);
      break;
  }
}

/** Push logic for input_text. */
function pushInputText(container, answer) {
  const inputEl = container.querySelector('.vt-input-element');
  if (inputEl) {
    inputEl.value = answer;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Push logic for rich_text. */
function pushRichText(container, answer) {
  const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
  if (ql) {
    ql.innerHTML = answer;
    ql.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Push logic for multichoice (array of strings). */
async function pushMultichoice(container, answerArray) {
  const multiEl = container.querySelector('.aa-question__multichoice');
  if (!multiEl) return;

  const buttonEls = Array.from(multiEl.querySelectorAll('.aa-question__button button'));

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
            reject(new Error('Timeout waiting for button to be enabled'));
          } else {
            setTimeout(check, interval);
          }
        }
      };
      check();
    });
  }

  async function ensureButtonState(button, shouldBeSelected, maxAttempts = 10) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      await waitForButtonEnabled(button);
      const isSelected = button.classList.contains('vt-button--primary') ||
        button.getAttribute('aria-pressed') === 'true';
      if (shouldBeSelected === isSelected) {
        return;
      } else {
        button.click();
        await new Promise(res => setTimeout(res, 500));
        attempts++;
      }
    }
  }

  for (const button of buttonEls) {
    const btnText = button.textContent.trim();
    const shouldBeSelected = Array.isArray(answerArray) && answerArray.includes(btnText);
    const isSelected = button.classList.contains('vt-button--primary') ||
      button.getAttribute('aria-pressed') === 'true';

    if (shouldBeSelected !== isSelected) {
      try {
        await ensureButtonState(button, shouldBeSelected);
      } catch (err) {
        console.error('[content.js] pushMultichoice: Error ensuring button state for', btnText, err);
      }
    }
  }
}

/** Push logic for button (single string). */
function pushButton(container, answer) {
  const buttonRow = container.querySelector('.aa-question__button-row');
  if (!buttonRow) return;

  const btnEls = Array.from(buttonRow.querySelectorAll('.aa-question__button button'));
  const btnToClick = btnEls.find(b => b.textContent.trim() === answer);
  if (btnToClick) {
    btnToClick.click();
  } else {
    console.warn('[content.js] pushButton: No button found matching:', answer);
  }
}


/**
 * Opens the correct section in OneTrust, waits, then scrolls the question into view.
 */
async function openSectionAndScroll(question) {
  const secButtons = document.querySelectorAll('.aa-section-list__section button');
  if (question.sectionIndex < secButtons.length) {
    secButtons[question.sectionIndex].click();
    await waitUntilLoaded();
  }

  const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
  const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);

  if (targetNameEl) {
    targetNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    console.warn('[content.js] Could not find question:', question.questionText);
  }
}

/**
 * Wait until .questions-container ot-loading disappears.
 */
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

/** Simple UUID generator */
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
