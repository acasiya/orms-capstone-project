// O.R.M.S. — My Reports: render + filter the citizen's submitted reports by status.

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("statusFilter");

  const badgeClass = {
    Submitted: "status-badge--submitted",
    "In Process": "status-badge--in-process",
    Resolved: "status-badge--resolved",
    "With Remarks": "status-badge--with-remarks",
  };

  function render() {
    const status = statusFilter.value;
    const rows = MY_REPORTS.filter((r) => status === "All" || r.status === status);

    if (!rows.length) {
      list.innerHTML = `<div class="ordinances-empty">No reports match this status.</div>`;
      return;
    }

    list.innerHTML = rows
      .map(
        (r) => `
        <div class="concern-row">
          <span class="concern-row__title">${r.title}</span>
          <span class="concern-row__date">${r.dateSubmitted}</span>
          <a class="concern-row__link" href="my-report-detail.html?id=${encodeURIComponent(r.id)}">View Details</a>
          <span class="status-badge ${badgeClass[r.status]}">${r.status}</span>
        </div>`
      )
      .join("");
  }

  statusFilter.addEventListener("change", render);
  render();
});
