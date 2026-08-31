// SafeSpace — Concern/Suggestion detail: view real info and let staff change
// its status (Submitted/Resolved) and leave remarks. Saves go through
// updateConcernStatus (PATCH /api/concerns/staff/<id>/) instead of the old
// localStorage-only folder-assignment mock.

const CONCERN_EVIDENCE_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

// Opens the clicked thumbnail full-size in an overlay on this same page,
// instead of navigating to it in a new tab.
function openMediaLightbox(url, isVideo) {
  const lightbox = document.getElementById("mediaLightbox");
  const body = document.getElementById("mediaLightboxBody");
  if (!lightbox || !body) return;
  body.innerHTML = isVideo
    ? `<video src="${url}" controls autoplay></video>`
    : `<img src="${url}" alt="Uploaded evidence" />`;
  lightbox.hidden = false;
}

function renderConcernDetailEvidence(container, urls) {
  if (!urls || !urls.length) {
    container.innerHTML = `<div class="evidence-photo">No uploaded evidence</div>`;
    return;
  }
  container.className = "evidence-photo-grid";
  container.innerHTML = urls
    .map((url) => {
      const isVideo = CONCERN_EVIDENCE_VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
      const media = isVideo ? `<video src="${url}" muted></video>` : `<img src="${url}" alt="Uploaded evidence" />`;
      return `<button type="button" class="evidence-photo-grid__item" data-lightbox-url="${url}" data-lightbox-video="${isVideo}">${media}</button>`;
    })
    .join("");
  container.querySelectorAll("[data-lightbox-url]").forEach((btn) => {
    btn.addEventListener("click", () => openMediaLightbox(btn.dataset.lightboxUrl, btn.dataset.lightboxVideo === "true"));
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const main = document.querySelector(".report-detail-main");

  try {
    await Promise.all([ensureConcernsLoaded(), ensureFoldersLoaded()]);
  } catch (err) {
    main.innerHTML = `<p>${err.message}</p>`;
    return;
  }

  const concern = getConcernById(id);

  if (!concern) {
    main.innerHTML = "<p>Concern/Suggestion not found.</p>";
    return;
  }

  document.title = `Concern/Suggestion — SafeSpace`;

  document.getElementById("concernName").value = concern.reporter;
  document.getElementById("concernContact").value = concern.contactNumber || "";
  document.getElementById("concernLocation").value = concern.location || "";
  document.getElementById("concernText").value = concern.concernText;

  const evidenceEl = document.getElementById("concernEvidence");
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

  // ---- Folder assignment — saves immediately on Assign/Remove, independent
  // of the Status/Remarks Save Changes flow below. ----

  const folderAssigned = document.getElementById("folderAssigned");
  const folderChip = document.getElementById("folderChip");
  const folderUnassignBtn = document.getElementById("folderUnassignBtn");
  const assignFolderBtn = document.getElementById("assignFolderBtn");
  const assignFolderModal = document.getElementById("assignFolderModal");
  const assignFolderSelect = document.getElementById("assignFolderSelect");
  const assignFolderNewInput = document.getElementById("assignFolderNewInput");
  const assignFolderConfirm = document.getElementById("assignFolderConfirm");
  const assignFolderCancel = document.getElementById("assignFolderCancel");

  function renderFolderAssignment() {
    if (concern.folderId) {
      folderAssigned.hidden = false;
      assignFolderBtn.hidden = true;
      folderChip.innerHTML = `&#128193; ${concern.folderName}`;
    } else {
      folderAssigned.hidden = true;
      assignFolderBtn.hidden = false;
    }
  }
  renderFolderAssignment();

  function populateFolderSelect() {
    assignFolderSelect.innerHTML =
      `<option value="">&mdash; Select a folder &mdash;</option>` +
      liveFolders().map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
  }

  assignFolderBtn.addEventListener("click", () => {
    populateFolderSelect();
    assignFolderNewInput.value = "";
    assignFolderModal.hidden = false;
  });
  folderUnassignBtn.addEventListener("click", async () => {
    try {
      await assignConcernFolder(concern.id, null);
      concern.folderId = null;
      concern.folderName = null;
      renderFolderAssignment();
    } catch (err) {
      alert(err.message);
    }
  });
  assignFolderCancel.addEventListener("click", () => {
    assignFolderModal.hidden = true;
  });
  assignFolderModal.addEventListener("click", (e) => {
    if (e.target === assignFolderModal) assignFolderModal.hidden = true;
  });
  assignFolderConfirm.addEventListener("click", async () => {
    const newName = assignFolderNewInput.value.trim();
    assignFolderConfirm.disabled = true;
    try {
      let folderId = assignFolderSelect.value;
      let folderName;
      if (newName) {
        await createFolder(newName);
        const created = liveFolders().find((f) => f.name.toLowerCase() === newName.toLowerCase());
        if (!created) throw new Error("Could not create this folder.");
        folderId = created.id;
        folderName = created.name;
      } else if (folderId) {
        folderName = liveFolders().find((f) => f.id === folderId)?.name;
      } else {
        assignFolderConfirm.disabled = false;
        return;
      }

      await assignConcernFolder(concern.id, folderId);
      concern.folderId = folderId;
      concern.folderName = folderName;
      renderFolderAssignment();
      assignFolderModal.hidden = true;
    } catch (err) {
      alert(err.message);
    } finally {
      assignFolderConfirm.disabled = false;
    }
  });

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
