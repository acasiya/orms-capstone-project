// O.R.M.S. — Report detail: view a report's real info and let staff change
// its status (and attach remarks when the status is "With Remarks"). Saves
// go through updateReportStatus (PATCH /api/reports/staff/<id>/) instead of
// the old localStorage-only mock.

function formatTime12h(hhmmss) {
  const [h, m] = hhmmss.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const REPORT_EVIDENCE_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

function renderReportEvidence(container, urls) {
  if (!urls || !urls.length) {
    container.innerHTML = `<div class="evidence-photo" aria-hidden="true">&#128247;</div>`;
    return;
  }
  container.className = "evidence-photo-grid";
  container.innerHTML = urls
    .map((url) => {
      const isVideo = REPORT_EVIDENCE_VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
      const media = isVideo ? `<video src="${url}" muted></video>` : `<img src="${url}" alt="Uploaded evidence" />`;
      return `<a class="evidence-photo-grid__item" href="${url}" target="_blank" rel="noopener">${media}</a>`;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const main = document.querySelector(".report-detail-main");

  try {
    await ensureReportsLoaded();
  } catch (err) {
    main.innerHTML = `<p>${err.message}</p>`;
    return;
  }

  const report = getReportById(id);

  if (!report) {
    main.innerHTML = "<p>Report not found.</p>";
    return;
  }

  document.title = `${report.incidentType} — O.R.M.S.`;

  document.getElementById("reportName").value = report.reporter;
  document.getElementById("reportContact").value = report.contactNumber || "";
  document.getElementById("reportLocation").value = report.location;
  document.getElementById("reportOrdinance").append(new Option(report.ordinance, report.ordinance, true, true));
  document.getElementById("reportDate").value = report.incidentDate;
  const timeLabel = formatTime12h(report.incidentTimeRaw);
  document.getElementById("reportTime").append(new Option(timeLabel, timeLabel, true, true));
  document.getElementById("reportNature").value = report.natureOfViolation;

  const evidenceEl = document.querySelector(".evidence-photo");
  if (evidenceEl) renderReportEvidence(evidenceEl, report.attachments);

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
      { label: "Submitted", description: "The report was submitted.", hours: 0 },
      { label: "Under Review", description: "The report is being reviewed", hours: 3 },
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

  async function commitSave() {
    const nextStatus = pendingStatus();
    const patch = {
      status: nextStatus,
      remarks: nextStatus === "With Remarks" ? remarksInput.value.trim() : "",
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await updateReportStatus(report.id, patch);
      currentStatus = nextStatus;
      savedStatus = currentStatus;
      savedRemarks = patch.remarks;

      applyPill(currentStatus);
      updateRemarksEnabled(currentStatus);
      remarksInput.value = patch.remarks;
      statusPill.hidden = false;
      statusSelect.hidden = true;
      renderTimeline(currentStatus, report.dateSubmitted);
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
  unsavedSaveBtn.addEventListener("click", async () => {
    unsavedChangesModal.hidden = true;
    if (await commitSave()) goToReports();
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
});
