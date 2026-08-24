// O.R.M.S. — Concern/Suggestion detail: view real info and let staff change
// its status (Submitted/Resolved) and leave remarks. Saves go through
// updateConcernStatus (PATCH /api/concerns/staff/<id>/) instead of the old
// localStorage-only folder-assignment mock.

const CONCERN_EVIDENCE_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

function renderConcernDetailEvidence(container, urls) {
  if (!urls || !urls.length) {
    container.innerHTML = `<div class="evidence-photo" aria-hidden="true">&#128247;</div>`;
    return;
  }
  container.className = "evidence-photo-grid";
  container.innerHTML = urls
    .map((url) => {
      const isVideo = CONCERN_EVIDENCE_VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
      const media = isVideo ? `<video src="${url}" muted></video>` : `<img src="${url}" alt="Uploaded evidence" />`;
      return `<a class="evidence-photo-grid__item" href="${url}" target="_blank" rel="noopener">${media}</a>`;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const main = document.querySelector(".report-detail-main");

  try {
    await ensureConcernsLoaded();
  } catch (err) {
    main.innerHTML = `<p>${err.message}</p>`;
    return;
  }

  const concern = getConcernById(id);

  if (!concern) {
    main.innerHTML = "<p>Concern/Suggestion not found.</p>";
    return;
  }

  document.title = `Concern/Suggestion — O.R.M.S.`;

  document.getElementById("concernName").value = concern.reporter;
  document.getElementById("concernContact").value = concern.contactNumber || "";
  document.getElementById("concernLocation").value = concern.location || "";
  document.getElementById("concernText").value = concern.concernText;

  const evidenceEl = document.querySelector(".evidence-photo");
  if (evidenceEl) renderConcernDetailEvidence(evidenceEl, concern.attachments);

  const timelineItems = document.getElementById("timelineItems");
  const submittedTime = concern.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  timelineItems.innerHTML = `
    <div class="status-timeline__item">
      <span class="status-timeline__dot"></span>
      <div>
        <div class="status-timeline__meta">
          <span class="status-timeline__label">Submitted</span>
          <span class="status-timeline__date">${formatConcernDate(concern.dateSubmitted)}, ${submittedTime}</span>
        </div>
        <p class="status-timeline__desc">The concern/suggestion was submitted.</p>
      </div>
    </div>`;

  const STATUSES_ORDERED = ["Submitted", "Resolved"];
  const STATUS_PILL_CLASS = { Submitted: "status-pill--new", Resolved: "status-pill--resolved" };

  const statusPill = document.getElementById("statusPill");
  const statusSelect = document.getElementById("statusSelect");
  const statusEditBtn = document.getElementById("statusEditBtn");
  const remarksInput = document.getElementById("remarksInput");
  const saveBtn = document.getElementById("saveChangesBtn");
  const backBtn = document.getElementById("backToConcernsBtn");

  const saveConfirmModal = document.getElementById("saveConfirmModal");
  const saveConfirmOk = document.getElementById("saveConfirmOk");
  const unsavedChangesModal = document.getElementById("unsavedChangesModal");
  const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
  const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
  const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");

  STATUSES_ORDERED.forEach((s) => statusSelect.append(new Option(s, s)));

  let currentStatus = concern.status;
  remarksInput.value = concern.remarks || "";
  remarksInput.disabled = false;

  let savedStatus = currentStatus;
  let savedRemarks = remarksInput.value.trim();

  function applyPill(status) {
    statusPill.className = `status-pill ${STATUS_PILL_CLASS[status] || "status-pill--new"}`;
    statusPill.textContent = status;
  }

  applyPill(currentStatus);

  statusEditBtn.addEventListener("click", () => {
    statusSelect.value = currentStatus;
    statusPill.hidden = true;
    statusSelect.hidden = false;
  });

  function pendingStatus() {
    return statusSelect.hidden ? currentStatus : statusSelect.value;
  }

  function isDirty() {
    return pendingStatus() !== savedStatus || remarksInput.value.trim() !== savedRemarks;
  }

  async function commitSave() {
    const nextStatus = pendingStatus();
    const patch = { status: nextStatus, remarks: remarksInput.value.trim() };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await updateConcernStatus(concern.id, patch);
      currentStatus = nextStatus;
      savedStatus = currentStatus;
      savedRemarks = patch.remarks;

      applyPill(currentStatus);
      statusPill.hidden = false;
      statusSelect.hidden = true;
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  }

  saveBtn.addEventListener("click", async () => {
    if (await commitSave()) saveConfirmModal.hidden = false;
  });
  saveConfirmOk.addEventListener("click", () => {
    saveConfirmModal.hidden = true;
  });

  function goToConcerns() {
    window.location.href = "concerns.html";
  }

  backBtn.addEventListener("click", () => {
    if (isDirty()) {
      unsavedChangesModal.hidden = false;
    } else {
      goToConcerns();
    }
  });
  unsavedSaveBtn.addEventListener("click", async () => {
    unsavedChangesModal.hidden = true;
    if (await commitSave()) goToConcerns();
  });
  unsavedDiscardBtn.addEventListener("click", () => {
    unsavedChangesModal.hidden = true;
    goToConcerns();
  });
  unsavedCancelBtn.addEventListener("click", () => {
    unsavedChangesModal.hidden = true;
  });
  [saveConfirmModal, unsavedChangesModal].forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
});
