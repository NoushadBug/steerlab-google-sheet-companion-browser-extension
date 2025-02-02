// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, data } = request;
  
    if (action === 'SCRAPE_SECTIONS') {
      // Make it async to wait for scrapeSections() (which is async)
      (async () => {
        try {
          const sections = await scrapeSections();
          // sections should be an array
          sendResponse(sections);
        } catch (err) {
          console.error('[content.js] Error scraping sections:', err);
          // Return an empty array or an error message
          sendResponse([]);
        }
      })();
      // Return true to indicate we'll send an asynchronous response
      return true;
    }
  
    if (action === 'GRAB_ANSWER') {
      // data is the question object
      const answer = grabAnswerFromDom(data);
      sendResponse({ answer });
      return true;
    }
  
    if (action === 'PUSH_ANSWER') {
      // data is the question object with .userAnswer
      pushAnswerToDom(data);
      sendResponse({ success: true });
      return true;
    }
  });
  
  
  /**
   * Helper: Wait until .questions-container ot-loading elements are gone.
   * Polls every 500ms. Exits once the elements are gone or times out.
   */
  function waitUntilLoaded(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      const interval = 500;
  
      const check = () => {
        const loadingEls = document.querySelectorAll('.questions-container ot-loading');
        if (loadingEls.length === 0) {
          // No more loading spinners => resolve
          clearInterval(timerId);
          resolve();
        } else {
          // Still loading, check if we timed out
          elapsed += interval;
          if (elapsed >= timeoutMs) {
            clearInterval(timerId);
            reject(new Error('Timed out waiting for questions to load.'));
          }
        }
      };
  
      const timerId = setInterval(check, interval);
      check(); // immediate check
    });
  }
  
  /**
   * Scrapes all sections from the OneTrust UI by:
   * 1) Clicking each section button
   * 2) Waiting for .questions-container ot-loading to disappear
   * 3) Collecting .aa-question__name data
   * Returns an array of sections, each with a questions array.
   */
  async function scrapeSections() {
    const allSections = [];
  
    // Step 1: get all the section elements
    const sectionEls = document.querySelectorAll('.aa-section-list__section');
  
    for (let secIndex = 0; secIndex < sectionEls.length; secIndex++) {
      const secEl = sectionEls[secIndex];
      const secButton = secEl.querySelector('button');
      const secName = secButton ? secButton.textContent.trim() : `Section ${secIndex + 1}`;
  
      // Expand this section if there's a button
      if (secButton) {
        secButton.click();
        // Wait until questions are fully loaded
        try {
          await waitUntilLoaded();
        } catch (err) {
          console.warn('[content.js] Loading timed out or failed:', err);
          // You can decide to continue or break here
        }
      }
  
      // Now scrape whatever questions are in this section
      const questionNameEls = document.querySelectorAll('.aa-question__name');
      const questionsArr = [];
  
      questionNameEls.forEach((qEl, qIndex) => {
        const txt = qEl.textContent.trim();
        const container = qEl.closest('.aa-question__container');
        const questionId = `Q${secIndex + 1}.${qIndex + 1}`;
  
        // Possibly detect answer type from container
        const answerType = detectAnswerType(container);
  
        questionsArr.push({
          sectionId: `${secIndex + 1}`,
          questionId,
          questionText: txt,
          answerType
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
   * Classify the question type by looking for known selectors.
   */
  function detectAnswerType(containerEl) {
    if (!containerEl) return '';
    if (containerEl.querySelector('.vt-input-element')) {
      return 'text_bar';
    } else if (containerEl.querySelector('.aa-question__multichoice')) {
      return 'multichoice';
    } else if (containerEl.querySelector('[ot-rich-text-editor-element]')) {
      return 'rich_text';
    }
    return 'unknown';
  }
  
  /**
   * Read the current text/checked values from the question in the DOM.
   */
  function grabAnswerFromDom(question) {
    // We might locate by matching question.questionText or questionId
    const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
    const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
    if (!targetNameEl) return '';
  
    const container = targetNameEl.closest('.aa-question__container');
    if (!container) return '';
  
    // Depending on type, read from different elements
    if (question.answerType === 'text_bar') {
      const inputEl = container.querySelector('.vt-input-element');
      return inputEl ? inputEl.value : '';
    } else if (question.answerType === 'rich_text') {
      const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
      return ql ? ql.innerHTML : '';
    } else if (question.answerType === 'multichoice') {
      const checkEls = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      const checkedValues = checkEls.filter(c => c.checked).map(c => c.value);
      return checkedValues.join(', ');
    }
  
    return '';
  }
  
  /**
   * Fill the DOM’s input fields for this question with question.userAnswer.
   */
  function pushAnswerToDom(question) {
    const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
    const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
    if (!targetNameEl) return;
  
    const container = targetNameEl.closest('.aa-question__container');
    if (!container) return;
  
    const answer = question.userAnswer || '';
  
    if (question.answerType === 'text_bar') {
      const inputEl = container.querySelector('.vt-input-element');
      if (inputEl) {
        inputEl.value = answer;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (question.answerType === 'rich_text') {
      const ql = container.querySelector('[ot-rich-text-editor-element] .ql-editor');
      if (ql) {
        ql.innerHTML = answer;
        ql.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (question.answerType === 'multichoice') {
      const checkEls = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      checkEls.forEach((c) => {
        c.checked = answer.includes(c.value);
        c.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }
  