// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, data } = request;

    if (action === 'SCROLL_TO_QUESTION') {
        // data => { sectionIndex, questionId, questionText, etc. }
        openSectionAndScroll(data)
            .then(() => {
                sendResponse({ success: true });
            })
            .catch(err => {
                console.error('[content.js] Failed to scroll to question:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true; // indicates async response
    }

    if (action === 'SCRAPE_SECTIONS') {
        // Because scrapeSections() is async, wrap in an IIFE
        (async () => {
            try {
                const sections = await scrapeSections();
                // sections should be an array of { sectionName, sectionId, questions: [...] }
                sendResponse(sections);
            } catch (err) {
                console.error('[content.js] Error scraping sections:', err);
                // Return an empty array if something went wrong
                sendResponse([]);
            }
        })();
        return true; // indicates async response
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
 * Opens the correct section in OneTrust, waits for questions to load,
 * then scrolls the question into view. Called by 'SCROLL_TO_QUESTION'.
 */
async function openSectionAndScroll(question) {
    const secButtons = document.querySelectorAll('.aa-section-list__section button');
    // question.sectionIndex is used to identify which section to open
    if (question.sectionIndex < secButtons.length) {
        secButtons[question.sectionIndex].click();
        await waitUntilLoaded(); // your existing spinner check
    }

    // Now locate the target question in the DOM by questionText
    const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
    const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);

    if (targetNameEl) {
        targetNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        console.warn('[content.js] Could not find question in DOM:', question.questionText);
    }
}

/**
 * Helper: Wait until .questions-container ot-loading elements are gone.
 * Polls every 500ms. Exits once they're gone or times out (20s).
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
 * Scrapes all sections in OneTrust by:
 * 1) Finding each .aa-section-list__section
 * 2) Clicking its button to expand
 * 3) Waiting for load to finish
 * 4) Collecting .aa-question__name
 *
 * Returns an array of:
 * [
 *   {
 *     sectionName: string,
 *     sectionId: string,
 *     questions: [
 *       {
 *         sectionId: string,
 *         questionId: string,
 *         questionText: string,
 *         answerType: 'text_bar' | 'rich_text' | 'multichoice' | 'unknown'
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */

/**
 * Generates a random UUID (v4-like).
 * Example output: "3d1b2f10-4166-4092-8776-3bf164d6a3b3"
 */
function generateUUID() {
    let d = new Date().getTime();
    // If we have performance.now(), use it to make the random number even more unpredictable
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        d += performance.now();
    }
    // 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx' pattern
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function scrapeSections() {
    const allSections = [];

    const sectionEls = document.querySelectorAll('.aa-section-list__section');
    for (let secIndex = 0; secIndex < sectionEls.length; secIndex++) {
        const secEl = sectionEls[secIndex];
        const secButton = secEl.querySelector('button');
        const secName = secButton ? secButton.textContent.trim() : `Section ${secIndex + 1}`;

        // Expand this section if there's a button
        if (secButton) {
            secButton.click();
            try {
                await waitUntilLoaded();
            } catch (err) {
                console.warn('[content.js] Loading timed out or failed:', err);
            }
        }

        // Collect the question elements
        // Collect the question elements
        const questionNameEls = document.querySelectorAll('.aa-question__name');
        const questionsArr = [];

        questionNameEls.forEach((qEl) => {
            // The question text
            const txt = qEl.textContent.trim();
            // The question container
            const container = qEl.closest('.aa-question__container');
            // Generate a random UUID instead of Q{secIndex}.{qIndex}
            const questionId = generateUUID();
            // Attempt to read the "display number" from a sibling or nested element
            // named ".aa-question__number" (adjust selector if needed)
            const numberEl = container.querySelector('.aa-question__number');
            const questionDisplayNumber = numberEl ? numberEl.textContent.trim() : '';

            // Possibly detect the answer type
            const answerType = detectAnswerType(container);

            questionsArr.push({
                questionId,            // the UUID
                questionText: txt,
                questionDisplayNumber, // from .aa-question__number
                answerType,
                sectionId: `${secIndex + 1}` // or however you want to store section ID
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
 * Classify the question type by scanning known elements:
 * - .vt-input-element => 'text_bar'
 * - .aa-question__multichoice => 'multichoice'
 * - [ot-rich-text-editor-element] => 'rich_text'
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
 * Reads the current text/checked values from a question in the DOM.
 * Called by 'GRAB_ANSWER'.
 */
function grabAnswerFromDom(question) {
    // Locate the question by text or questionId
    const questionEls = Array.from(document.querySelectorAll('.aa-question__name'));
    const targetNameEl = questionEls.find(el => el.textContent.trim() === question.questionText);
    if (!targetNameEl) return '';

    const container = targetNameEl.closest('.aa-question__container');
    if (!container) return '';

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
 * Writes the given userAnswer into the DOM for a question.
 * Called by 'PUSH_ANSWER'.
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
            // Dispatch an 'input' event so OneTrust sees the change
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
