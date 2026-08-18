// O.R.M.S. — Concern/Suggestion detail: view info, assign/change its folder,
// and leave remarks once it's foldered. Edits are kept in localStorage (via
// saveConcernOverride) so they show up back on the list and dashboard too.

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const concern = getConcernById(id);

  if (!concern) {
    document.querySelector(".report-detail-main").innerHTML = "<p>Concern/Suggestion not found.</p>";
    return;
  }

  document.title = `${concern.category} — O.R.M.S.`;

  document.getElementById("concernName").value = concern.reporter;
  document.getElementById("concernContact").value = concern.contactNumber;
  document.getElementById("concernLocation").value = concern.location;
  document.getElementById("concernText").value = concern.concernText;

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
        <p class="status-timeline__desc">Your Suggestion/Concern has been submitted successfully.</p>
      </div>
    </div>`;

  const folderAssigned = document.getElementById("folderAssigned");
  const folderChip = document.getElementById("folderChip");
  const assignFolderBtn = document.getElementById("assignFolderBtn");
  const folderUnassignBtn = document.getElementById("folderUnassignBtn");
  const remarksInput = document.getElementById("remarksInput");
  const saveBtn = document.getElementById("saveChangesBtn");
  const backBtn = document.getElementById("backToConcernsBtn");

  const assignFolderModal = document.getElementById("assignFolderModal");
  const assignFolderSelect = document.getElementById("assignFolderSelect");
  const assignFolderNewInput = document.getElementById("assignFolderNewInput");
  const assignFolderConfirm = document.getElementById("assignFolderConfirm");
  const assignFolderCancel = document.getElementById("assignFolderCancel");

  const saveConfirmModal = document.getElementById("saveConfirmModal");
  const saveConfirmOk = document.getElementById("saveConfirmOk");
  const unsavedChangesModal = document.getElementById("unsavedChangesModal");
  const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
  const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
  const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");

  let pendingFolder = concern.folder;
  let savedFolder = pendingFolder;
  remarksInput.value = concern.remarks || "";
  let savedRemarks = remarksInput.value.trim();

  function updateFolderUI() {
    if (pendingFolder && pendingFolder !== "-") {
      folderChip.innerHTML = `&#128193; ${pendingFolder}`;
      folderAssigned.hidden = false;
      assignFolderBtn.hidden = true;
    } else {
      folderAssigned.hidden = true;
      assignFolderBtn.hidden = false;
    }
  }

  function updateRemarksEnabled() {
    remarksInput.disabled = !(pendingFolder && pendingFolder !== "-");
  }

  updateFolderUI();
  updateRemarksEnabled();

  assignFolderBtn.addEventListener("click", () => {
    assignFolderSelect.innerHTML =
      `<option value="">&mdash; Select a folder &mdash;</option>` +
      getFoldersList().map((name) => `<option value="${name}">${name}</option>`).join("");
    assignFolderNewInput.value = "";
    assignFolderModal.hidden = false;
  });

  folderUnassignBtn.addEventListener("click", () => {
    pendingFolder = "-";
    updateFolderUI();
    updateRemarksEnabled();
  });

  assignFolderCancel.addEventListener("click", () => {
    assignFolderModal.hidden = true;
  });
  assignFolderConfirm.addEventListener("click", () => {
    const newName = assignFolderNewInput.value.trim();
    const chosen = newName || assignFolderSelect.value;
    if (!chosen) return;
    if (newName) addFolder(newName);
    pendingFolder = chosen;
    updateFolderUI();
    updateRemarksEnabled();
    assignFolderModal.hidden = true;
  });
  assignFolderModal.addEventListener("click", (e) => {
    if (e.target === assignFolderModal) assignFolderModal.hidden = true;
  });
  assignFolderNewInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      assignFolderConfirm.click();
    }
  });

  function isDirty() {
    if (pendingFolder !== savedFolder) return true;
    if (pendingFolder !== "-") return remarksInput.value.trim() !== savedRemarks;
    return false;
  }

  function commitSave() {
    savedFolder = pendingFolder;
    const patch = {
      folder: pendingFolder,
      status: pendingFolder !== "-" ? "In Folder" : "New Submission",
      remarks: pendingFolder !== "-" ? remarksInput.value.trim() : "",
    };
    saveConcernOverride(concern.id, patch);
    savedRemarks = patch.remarks;
    remarksInput.value = patch.remarks;
    updateFolderUI();
    updateRemarksEnabled();
  }

  saveBtn.addEventListener("click", () => {
    commitSave();
    saveConfirmModal.hidden = false;
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
  unsavedSaveBtn.addEventListener("click", () => {
    commitSave();
    unsavedChangesModal.hidden = true;
    goToConcerns();
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

  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  if (notifBell && notifDropdown) {
    notifBell.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.hidden = !notifDropdown.hidden;
    });
    document.addEventListener("click", () => {
      notifDropdown.hidden = true;
    });
  }
});
