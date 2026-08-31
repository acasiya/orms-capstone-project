// SafeSpace — My Reports: render + filter the citizen's submitted reports by status.
// Data now comes from the real API (see my-reports-data.js) instead of a
// hardcoded array, so this file is async where it fetches reports.

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("statusFilter");

  const badgeClass = {
    Submitted: "status-badge--submitted",
    "Under Review": "status-badge--in-process",
    "In Action": "status-badge--with-remarks",
    Resolved: "status-badge--resolved",
  };

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  let reports = [];

  function render() {
    const filterValue = statusFilter.value;
    const rows = reports.filter((r) => {
      const label = REPORT_STATUS_LABELS[r.status] || r.status;
      return filterValue === "All" || label === filterValue;
    });

    if (!rows.length) {
      list.innerHTML = `<div class="ordinances-empty">No reports match this status.</div>`;
      return;
    }

    list.innerHTML = rows
      .map((r) => {
        const label = REPORT_STATUS_LABELS[r.status] || r.status;
        return `
        <div class="concern-row">
          <span class="concern-row__title">${r.ordinance}</span>
          <span class="concern-row__date">${formatDate(r.created_at)}</span>
          <a class="concern-row__link" href="my-report-detail.html?id=${encodeURIComponent(r.id)}">View Details</a>
          <span class="status-badge ${badgeClass[label] || ""}">${label}</span>
        </div>`;
      })
      .join("");
  }

  statusFilter.addEventListener("change", render);

  list.innerHTML = `<div class="ordinances-empty">Loading your reports...</div>`;
  try {
    reports = await getMyReports();
    render();
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }
});
