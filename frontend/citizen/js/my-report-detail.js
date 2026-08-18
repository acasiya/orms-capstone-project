// O.R.M.S. — My Report detail: populate the page from the ?id= query param.

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const report = MY_REPORTS.find((r) => r.id === id);

  if (!report) {
    document.querySelector(".concern-detail__main").innerHTML = "<p>Report not found.</p>";
    return;
  }

  document.title = `${report.title} — O.R.M.S.`;

  document.getElementById("reportLocation").value = report.location;
  document.getElementById("reportOrdinance").append(new Option(report.ordinance, report.ordinance, true, true));
  document.getElementById("reportDate").value = report.incidentDate;
  document.getElementById("reportTime").append(new Option(report.incidentTime, report.incidentTime, true, true));
  document.getElementById("reportNature").value = report.natureOfViolation;

  const timelineItems = document.getElementById("timelineItems");
  timelineItems.innerHTML = report.timeline
    .map((step) => {
      const pending = !step.date;
      return `
        <div class="status-timeline__item">
          <span class="status-timeline__dot${pending ? " status-timeline__dot--pending" : ""}"></span>
          <div>
            <div class="status-timeline__meta">
              <span class="status-timeline__label${pending ? " status-timeline__label--pending" : ""}">${step.label}</span>
              <span class="status-timeline__date">${pending ? "Pending" : `${step.date}, ${step.time}`}</span>
            </div>
            <p class="status-timeline__desc">${step.description}</p>
          </div>
        </div>`;
    })
    .join("");

  if (report.remarks) {
    document.getElementById("remarksCard").hidden = false;
    document.getElementById("remarksText").textContent = report.remarks;
  }
});
