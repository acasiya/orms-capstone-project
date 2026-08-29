// O.R.M.S. — Report detail: view a report's real info and let staff change
// its status and remarks (remarks are always editable, independent of
// status — not gated to one specific status choice). Saves go through
// updateReportStatus (PATCH /api/reports/staff/<id>/) instead of the old
// localStorage-only mock.

function formatTime12h(hhmmss) {
  const [h, m] = hhmmss.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const REPORT_EVIDENCE_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

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

function renderReportEvidence(container, urls) {
  if (!urls || !urls.length) {
    container.innerHTML = `<div class="evidence-photo">No uploaded evidence</div>`;
    return;
  }
  container.className = "evidence-photo-grid";
  container.innerHTML = urls
    .map((url) => {
      const isVideo = REPORT_EVIDENCE_VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
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
    await ensureOrdinancesLoaded();
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

  const evidenceEl = document.getElementById("reportEvidence");
  if (evidenceEl) renderReportEvidence(evidenceEl, report.attachments);

  // Ordered to exactly match the status timeline's 4 stages below — a
  // status's completed-steps count is just its index here, no separate
  // mapping to keep in sync.
  const STATUSES_ORDERED = ["New Submission", "Under Review", "In Action", "Resolved"];
  const STATUS_PILL_CLASS = {
    "New Submission": "status-pill--new",
    "Under Review": "status-pill--in-process",
    "In Action": "status-pill--remarks",
    Resolved: "status-pill--resolved",
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

  function offsetHours(base, hours) {
    return new Date(base.getTime() + hours * 3600000);
  }

  function renderTimeline(status, dateSubmitted) {
    const steps = [
      { label: "Submitted", description: "The report was submitted.", hours: 0 },
      { label: "Under Review", description: "The report is being reviewed", hours: 3 },
      { label: "In Action", description: "Appropriate actions are being taken.", hours: 26 },
      { label: "Final Verdict", description: "Report is finished and closed.", hours: 50 },
    ];
    // Status is one of STATUSES_ORDERED, in the same order as these 4
    // stages, so "how many steps are done" is just that status's position.
    const completedSteps = STATUSES_ORDERED.indexOf(status) + 1;

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
  renderTimeline(currentStatus, report.dateSubmitted);

  statusEditBtn.addEventListener("click", () => {
    statusSelect.value = currentStatus;
    statusPill.hidden = true;
    statusSelect.hidden = false;
  });

  function pendingStatus() {
    return statusSelect.hidden ? currentStatus : statusSelect.value;
  }

  // Remarks are always editable, so a remarks edit counts as dirty
  // regardless of which status is currently selected.
  function isDirty() {
    return pendingStatus() !== savedStatus || remarksInput.value.trim() !== savedRemarks;
  }

  async function commitSave() {
    const nextStatus = pendingStatus();
    const patch = {
      status: nextStatus,
      remarks: remarksInput.value.trim(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await updateReportStatus(report.id, patch);
      currentStatus = nextStatus;
      savedStatus = currentStatus;
      savedRemarks = patch.remarks;

      applyPill(currentStatus);
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
