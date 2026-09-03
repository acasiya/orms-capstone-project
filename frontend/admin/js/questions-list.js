// SafeSpace — Questions (Admin): view + respond to citizen-asked questions
// (same as Staff's), plus manage the public FAQ list — either from scratch,
// or by promoting an answered question that keeps coming up (see the "Add
// to FAQs" button on each answered row). Answered questions stay in the
// list (never removed) — see StaffQuestionAnswerView's docstring — so a
// repeat pattern stays visible to notice in the first place.

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatQuestionDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("questionsList");
  const statusFilter = document.getElementById("statusFilter");
  const faqManageList = document.getElementById("faqManageList");
  const addFaqBtn = document.getElementById("addFaqBtn");

  const faqModal = document.getElementById("faqModal");
  const faqModalTitle = document.getElementById("faqModalTitle");
  const faqQuestionInput = document.getElementById("faqQuestionInput");
  const faqAnswerInput = document.getElementById("faqAnswerInput");
  const faqModalSave = document.getElementById("faqModalSave");
  const faqModalCancel = document.getElementById("faqModalCancel");

  const faqDeleteModal = document.getElementById("faqDeleteModal");
  const faqDeleteConfirm = document.getElementById("faqDeleteConfirm");
  const faqDeleteCancel = document.getElementById("faqDeleteCancel");

  let questions = [];
  let faqs = [];
  let editingFaqId = null; // null while adding a brand-new FAQ
  let deletingFaqId = null;

  // ---- Citizen questions ----

  function renderQuestions() {
    if (!list) return;
    const filterValue = statusFilter ? statusFilter.value : "all";
    const rows = questions.filter((q) => {
      if (filterValue === "pending") return !q.is_answered;
      if (filterValue === "answered") return q.is_answered;
      return true;
    });

    if (!rows.length) {
      list.innerHTML = `<div class="ordinances-empty">${questions.length ? "No questions match this filter." : "No questions asked yet."}</div>`;
      return;
    }

    list.innerHTML = rows
      .map(
        (q) => `
        <div class="question-row" data-id="${q.id}">
          <div class="question-row__top">
            <div>
              <div class="question-row__text">${escapeHtml(q.question)}</div>
              <div class="question-row__meta">Asked by ${escapeHtml(q.asker)} (${escapeHtml(q.asker_email)}) — ${formatQuestionDate(q.created_at)}</div>
            </div>
            <span class="status-badge ${q.is_answered ? "status-badge--resolved" : "status-badge--submitted"}">${q.is_answered ? "Answered" : "Pending"}</span>
          </div>
          ${
            q.is_answered
              ? `<div class="question-row__answer">
                   <p class="question-row__answer-label">Answer${q.answered_by_name ? ` — ${escapeHtml(q.answered_by_name)} (${escapeHtml(q.answered_by_role || "")})` : ""}</p>
                   ${escapeHtml(q.answer)}
                 </div>
                 <div class="question-row__respond">
                   <button type="button" class="btn btn-muted" data-add-to-faq="${q.id}">Add to FAQs</button>
                 </div>`
              : `<div class="question-row__respond">
                  <textarea placeholder="Type your answer..." data-answer-input></textarea>
                  <button type="button" class="btn" data-send-answer>Send Answer</button>
                </div>`
          }
        </div>`
      )
      .join("");

    list.querySelectorAll("[data-send-answer]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".question-row");
        const textarea = row.querySelector("[data-answer-input]");
        const value = textarea.value.trim();
        if (!value) return;

        btn.disabled = true;
        btn.textContent = "Sending...";
        try {
          const updated = await answerQuestion(row.dataset.id, value);
          const idx = questions.findIndex((item) => item.id === updated.id);
          if (idx !== -1) questions[idx] = updated;
          renderQuestions();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = "Send Answer";
        }
      });
    });

    list.querySelectorAll("[data-add-to-faq]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const question = questions.find((item) => item.id === btn.dataset.addToFaq);
        if (!question) return;
        openFaqModal(null, { question: question.question, answer: question.answer });
      });
    });
  }

  // ---- FAQ management ----

  function renderFaqManageList() {
    if (!faqManageList) return;
    if (!faqs.length) {
      faqManageList.innerHTML = `<div class="ordinances-empty">No FAQs yet.</div>`;
      return;
    }
    faqManageList.innerHTML = faqs
      .map(
        (f) => `
        <div class="faq-manage-item">
          <span class="faq-manage-item__text" title="${escapeHtml(f.question)}">${escapeHtml(f.question)}</span>
          <span class="faq-manage-item__actions">
            <button type="button" data-edit-faq="${f.id}" aria-label="Edit"><svg class="nav-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20H5.5a1.5 1.5 0 01-1.5-1.5V12"/><path d="M17.4 3.6a2.1 2.1 0 013 3L10 17l-4.5 1.2L6.8 13.7z"/></svg></button>
            <button type="button" data-delete-faq="${f.id}" aria-label="Delete"><svg class="nav-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2"/><path d="M6.5 7l1 12a1.5 1.5 0 001.5 1.4h6a1.5 1.5 0 001.5-1.4l1-12"/><path d="M10 11v6M14 11v6"/></svg></button>
          </span>
        </div>`
      )
      .join("");

    faqManageList.querySelectorAll("[data-edit-faq]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const faq = faqs.find((f) => f.id === btn.dataset.editFaq);
        if (faq) openFaqModal(faq.id, faq);
      });
    });
    faqManageList.querySelectorAll("[data-delete-faq]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deletingFaqId = btn.dataset.deleteFaq;
        if (faqDeleteModal) faqDeleteModal.hidden = false;
      });
    });
  }

  function openFaqModal(id, { question, answer }) {
    editingFaqId = id;
    if (faqModalTitle) faqModalTitle.textContent = id ? "Edit FAQ" : "Add FAQ";
    if (faqQuestionInput) faqQuestionInput.value = question || "";
    if (faqAnswerInput) faqAnswerInput.value = answer || "";
    if (faqModal) faqModal.hidden = false;
  }

  if (addFaqBtn) {
    addFaqBtn.addEventListener("click", () => openFaqModal(null, { question: "", answer: "" }));
  }

  if (faqModalCancel) {
    faqModalCancel.addEventListener("click", () => {
      if (faqModal) faqModal.hidden = true;
    });
  }

  if (faqModalSave) {
    faqModalSave.addEventListener("click", async () => {
      const question = faqQuestionInput.value.trim();
      const answer = faqAnswerInput.value.trim();
      if (!question || !answer) {
        alert("Both a question and an answer are required.");
        return;
      }

      faqModalSave.disabled = true;
      try {
        if (editingFaqId) {
          const updated = await updateFAQ(editingFaqId, question, answer);
          const idx = faqs.findIndex((f) => f.id === updated.id);
          if (idx !== -1) faqs[idx] = updated;
        } else {
          const created = await createFAQ(question, answer);
          faqs.push(created);
        }
        renderFaqManageList();
        faqModal.hidden = true;
      } catch (err) {
        alert(err.message);
      } finally {
        faqModalSave.disabled = false;
      }
    });
  }

  if (faqDeleteCancel) {
    faqDeleteCancel.addEventListener("click", () => {
      deletingFaqId = null;
      if (faqDeleteModal) faqDeleteModal.hidden = true;
    });
  }

  if (faqDeleteConfirm) {
    faqDeleteConfirm.addEventListener("click", async () => {
      if (!deletingFaqId) return;
      faqDeleteConfirm.disabled = true;
      try {
        await deleteFAQ(deletingFaqId);
        faqs = faqs.filter((f) => f.id !== deletingFaqId);
        renderFaqManageList();
        faqDeleteModal.hidden = true;
      } catch (err) {
        alert(err.message);
      } finally {
        faqDeleteConfirm.disabled = false;
        deletingFaqId = null;
      }
    });
  }

  if (statusFilter) statusFilter.addEventListener("change", renderQuestions);

  if (list) list.innerHTML = `<div class="ordinances-empty">Loading questions...</div>`;
  if (faqManageList) faqManageList.innerHTML = `<div class="ordinances-empty">Loading...</div>`;

  try {
    [questions, faqs] = await Promise.all([getQuestions(), getManagedFAQs()]);
    renderQuestions();
    renderFaqManageList();
  } catch (err) {
    if (list) list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }
});
