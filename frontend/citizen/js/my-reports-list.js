// SafeSpace — My Reports: render + filter the citizen's submitted reports by
// status, paginated. Data now comes from the real API (see
// my-reports-data.js) instead of a hardcoded array, so this file is async
// where it fetches reports.

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 8;

  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("statusFilter");
  const pagination = document.getElementById("reportsPagination");

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
  let page = 1;
  // Resolved reports are hidden until the citizen actually picks a filter
  // themselves — even re-selecting "All" counts, since that's an explicit
  // "yes, show everything" action. Only the untouched initial load (which
  // happens to also show "All" selected) excludes Resolved by default.
  let filterTouched = false;

  function getFiltered() {
    const filterValue = statusFilter.value;
    return reports.filter((r) => {
      const label = REPORT_STATUS_LABELS[r.status] || r.status;
      if (!filterTouched && filterValue === "All") return label !== "Resolved";
      return filterValue === "All" || label === filterValue;
    });
  }

  function render() {
    const rows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    list.innerHTML = pageRows.length
      ? pageRows
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
          .join("")
      : `<div class="ordinances-empty">No reports match this status.</div>`;

    if (pagination) {
      renderPaginationControls(pagination, page, totalPages, (n) => {
        page = n;
        render();
      });
    }
  }

  statusFilter.addEventListener("change", () => {
    filterTouched = true;
    page = 1;
    render();
  });

  list.innerHTML = `<div class="ordinances-empty">Loading your reports...</div>`;
  try {
    reports = await getMyReports();
    render();
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }
});
