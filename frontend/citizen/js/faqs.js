// SafeSpace — FAQs page: renders the public FAQ accordion, and handles
// Ask a Question via the floating "?" button (guests get the sign-up/login
// prompt, same as File Report/Submit Suggestion). Asked questions no longer
// show inline on this page — the citizen gets emailed the answer once a
// Barangay Official responds (see send_question_answered_email).

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

  // ---- Ask a Question (floating "?" button) ----
  const askFab = document.getElementById("askQuestionFab");
  const askQuestionModal = document.getElementById("askQuestionModal");
  const askQuestionSentModal = document.getElementById("askQuestionSentModal");

  if (askFab && askQuestionModal) {
    askFab.addEventListener("click", () => {
      if (!isLoggedIn()) {
        if (authGateModal && authGateTitle) {
          authGateTitle.textContent = "Want to Ask a Question?";
          authGateModal.hidden = false;
        }
        return;
      }
      askQuestionModal.hidden = false;
    });
  }

  if (askForm) {
    askForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = askForm.querySelector('button[type="submit"]');
      const value = questionInput.value.trim();
      if (!value) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      try {
        await askQuestion(value);
        questionInput.value = "";
        if (askQuestionModal) askQuestionModal.hidden = true;
        if (askQuestionSentModal) askQuestionSentModal.hidden = false;
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Question";
      }
    });
  }

  if (askQuestionSentModal) {
    askQuestionSentModal.querySelectorAll("[data-modal-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        askQuestionSentModal.hidden = true;
      });
    });
  }
});
