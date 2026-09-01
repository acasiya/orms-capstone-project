// SafeSpace — FAQs page: renders the public FAQ accordion, handles the Ask
// a Question form (guests get the sign-up/login prompt, same as File
// Report/Submit Suggestion), and — for logged-in citizens — renders their
// own asked questions with any answer.

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderFaqAccordion(container, items, { openFirst = false } = {}) {
  if (!items.length) {
    container.innerHTML = `<div class="ordinances-empty">Nothing here yet.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item, i) => `
      <details class="faq-item"${openFirst && i === 0 ? " open" : ""}>
        <summary>${item.summary}</summary>
        <div class="faq-item__answer">${item.answer}</div>
      </details>`
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const faqList = document.getElementById("faqList");
  const askForm = document.getElementById("askQuestionForm");
  const questionInput = document.getElementById("questionInput");
  // Visibility of the section itself is handled by main.js's generic
  // [data-auth-only] hiding — this file only needs to (re)populate it.
  const myQuestionsList = document.getElementById("myQuestionsList");
  const authGateModal = document.getElementById("authGateModal");
  const authGateTitle = document.getElementById("authGateTitle");

  // ---- Public FAQ list ----
  try {
    const faqs = await getFAQs();
    renderFaqAccordion(
      faqList,
      faqs.map((f) => ({ summary: escapeHtml(f.question), answer: escapeHtml(f.answer) })),
      { openFirst: true }
    );
  } catch (err) {
    faqList.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }

  // ---- My Questions (logged-in citizens only) ----
  async function loadMyQuestions() {
    if (!isLoggedIn() || !myQuestionsList) return;
    try {
      const questions = await getMyQuestions();
      renderFaqAccordion(
        myQuestionsList,
        questions.map((q) => ({
          summary: `${escapeHtml(q.question)} <span class="status-badge ${q.is_answered ? "status-badge--resolved" : "status-badge--submitted"}" style="display:inline-block;margin-left:8px;">${q.is_answered ? "Answered" : "Pending"}</span>`,
          answer: q.is_answered ? escapeHtml(q.answer) : "Waiting for a response from the Barangay.",
        }))
      );
    } catch (err) {
      myQuestionsList.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    }
  }
  loadMyQuestions();

  // ---- Ask a Question ----
  if (askForm) {
    askForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isLoggedIn()) {
        if (authGateModal && authGateTitle) {
          authGateTitle.textContent = "Want to Ask a Question?";
          authGateModal.hidden = false;
        }
        return;
      }

      const submitBtn = askForm.querySelector('button[type="submit"]');
      const value = questionInput.value.trim();
      if (!value) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      try {
        await askQuestion(value);
        questionInput.value = "";
        await loadMyQuestions();
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Question";
      }
    });
  }
});
