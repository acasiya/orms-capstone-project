// O.R.M.S. — Report detail: view a report's info and let staff change its
// status (and attach remarks when the status is "With Remarks"). Edits are
// kept in localStorage (via saveReportOverride) so they show up back on the
// dashboard and reports list too.

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const report = getReportById(id);

  if (!report) {
    document.querySelector(".report-detail-main").innerHTML = "<p>Report not found.</p>";
    return;
  }

  document.title = `${report.incidentType} — O.R.M.S.`;

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  document.getElementById("reportName").value = report.reporter;
  document.getElementById("reportContact").value = report.contactNumber;
  document.getElementById("reportLocation").value = report.location;
  document.getElementById("reportOrdinance").append(new Option(report.ordinance, report.ordinance, true, true));
  document.getElementById("reportDate").value = toDateInputValue(report.dateSubmitted);
  const timeStr = report.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  document.getElementById("reportTime").append(new Option(timeStr, timeStr, true, true));
  document.getElementById("reportNature").value = report.natureOfViolation;

  const STATUSES_ORDERED = ["New Submission", "In Process", "Resolved", "With Remarks"];
  const STATUS_PILL_CLASS = {
    "New Submission": "status-pill--new",
    "In Process": "status-pill--in-process",
    Resolved: "status-pill--resolved",
    "With Remarks": "status-pill--remarks",
  };

  const statusPill = document.getElementById("statusPill");
  const statusSelect = document.getElementById("statusSelect");
  const statusEditBtn = document.getElementById("statusEditBtn");
  const remarksInput = document.getElementById("remarksInput");
  const saveBtn = document.getElementById("saveChangesBtn");
  const timelineItems = document.getElementById("timelineItems");
  const backToReportsBtn = document.getElementById("backToReportsBtn");
  const saveConfirmModal = document.getElementById("saveConfirmModal");
  const saveConfirmOk = document.getElementById("saveConfirmOk");
  const unsavedChangesModal = document.getElementById("unsavedChangesModal");
  const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
  const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
  const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");

  STATUSES_ORDERED.forEach((s) => statusSelect.append(new Option(s, s)));

  let currentStatus = report.status;
  remarksInput.value = report.remarks || "";

  // Snapshot of what's actually persisted, so we can tell whether the user
  // has made edits that haven't been saved yet.
  let savedStatus = currentStatus;
  let savedRemarks = remarksInput.value.trim();

  function applyPill(status) {
    statusPill.className = `status-pill ${STATUS_PILL_CLASS[status]}`;
    statusPill.textContent = status;
  }

  function updateRemarksEnabled(status) {
    remarksInput.disabled = status !== "With Remarks";
  }

  function offsetHours(base, hours) {
    return new Date(base.getTime() + hours * 3600000);
  }

  function renderTimeline(status, dateSubmitted) {
    const steps = [
      { label: "Submitted", description: "Your report has been submitted successfully.", hours: 0 },
      { label: "Under Review", description: "Your report is being reviewed", hours: 3 },
      { label: "For Action", description: "Appropriate actions are being taken.", hours: 26 },
      { label: "Final Verdict", description: "Report is finished and closed.", hours: 50 },
    ];
    const completedSteps = status === "New Submission" ? 1 : status === "In Process" ? 2 : 4;

    timelineItems.innerHTML = steps
      .map((step, i) => {
        const pending = i >= completedSteps;
        const stepDate = offsetHours(dateSubmitted, step.hours);
        const dateLabel = pending
          ? "Pending"
          : `${formatReportDate(stepDate)}, ${stepDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
        return `
          <div class="status-timeline__item">
            <span class="status-timeline__dot${pending ? " status-timeline__dot--pending" : ""}"></span>
            <div>
              <div class="status-timeline__meta">
                <span class="status-timeline__label${pending ? " status-timeline__label--pending" : ""}">${step.label}</span>
                <span class="status-timeline__date">${dateLabel}</span>
              </div>
              <p class="status-timeline__desc">${step.description}</p>
            </div>
          </div>`;
      })
      .join("");
  }

  applyPill(currentStatus);
  updateRemarksEnabled(currentStatus);
  renderTimeline(currentStatus, report.dateSubmitted);

  statusEditBtn.addEventListener("click", () => {
    statusSelect.value = currentStatus;
    updateRemarksEnabled(statusSelect.value);
    statusPill.hidden = true;
    statusSelect.hidden = false;
  });

  statusSelect.addEventListener("change", () => updateRemarksEnabled(statusSelect.value));

  function pendingStatus() {
    return statusSelect.hidden ? currentStatus : statusSelect.value;
  }

  function isDirty() {
    const status = pendingStatus();
    if (status !== savedStatus) return true;
    if (status === "With Remarks") return remarksInput.value.trim() !== savedRemarks;
    return false;
  }

  function commitSave() {
    currentStatus = pendingStatus();
    const patch = {
      status: currentStatus,
      remarks: currentStatus === "With Remarks" ? remarksInput.value.trim() : "",
    };
    saveReportOverride(report.id, patch);
    savedStatus = currentStatus;
    savedRemarks = patch.remarks;

    applyPill(currentStatus);
    updateRemarksEnabled(currentStatus);
    remarksInput.value = patch.remarks;
    statusPill.hidden = false;
    statusSelect.hidden = true;
    renderTimeline(currentStatus, report.dateSubmitted);
  }

  saveBtn.addEventListener("click", () => {
    commitSave();
    saveConfirmModal.hidden = false;
  });
  saveConfirmOk.addEventListener("click", () => {
    saveConfirmModal.hidden = true;
  });

  function goToReports() {
    window.location.href = "reports.html";
  }

  backToReportsBtn.addEventListener("click", () => {
    if (isDirty()) {
      unsavedChangesModal.hidden = false;
    } else {
      goToReports();
    }
  });
  unsavedSaveBtn.addEventListener("click", () => {
    commitSave();
    unsavedChangesModal.hidden = true;
    goToReports();
  });
  unsavedDiscardBtn.addEventListener("click", () => {
    unsavedChangesModal.hidden = true;
    goToReports();
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
