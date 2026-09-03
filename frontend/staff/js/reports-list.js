// SafeSpace — Reports Management: search + filter (type/date/status) +
// paginate across real reports from reports-data.js (GET /api/reports/staff/).
// Reports is the Investigator's claimable work queue — see reports-data.js's
// claimReport/forfeitReport.

function escapeReportHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 8;

  const searchForm = document.getElementById("reportSearchForm");
  const searchInput = document.getElementById("reportSearchInput");
  const typeFilter = document.getElementById("typeFilter");
  const dateFilter = document.getElementById("dateFilter");
  const statusFilter = document.getElementById("statusFilter");
  const list = document.getElementById("reportsList");
  const pagination = document.getElementById("reportsPagination");

  let page = 1;

  list.innerHTML = `<div class="ordinances-empty">Loading reports...</div>`;
  try {
    await ensureOrdinancesLoaded();
    await ensureReportsLoaded();
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    return;
  }

  // No fixed category list anymore (that was mock data) — the type filter
  // now only ever offers ordinances that actually appear in real reports.
  Array.from(new Set(liveReports().map((r) => r.incidentType)))
    .sort()
    .forEach((type) => {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      typeFilter.appendChild(opt);
    });

  const badgeClass = {
    "New Submission": "status-badge--submitted",
    "Under Review": "status-badge--in-process",
    "In Action": "status-badge--with-remarks",
    Resolved: "status-badge--resolved",
  };

  function buildPageList(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push("...");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
  }

  function getFiltered() {
    let rows = dateFilter.value === "all" ? liveReports() : getReportsForPeriod(dateFilter.value);

    if (typeFilter.value !== "all") {
      rows = rows.filter((r) => r.incidentType === typeFilter.value);
    }
    if (statusFilter.value !== "all") {
      rows = rows.filter((r) => r.status === statusFilter.value);
    }

    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (r) =>
          r.incidentType.toLowerCase().includes(query) ||
          r.location.toLowerCase().includes(query) ||
          r.reporter.toLowerCase().includes(query)
      );
    }

    return rows;
  }

  function render() {
    const rows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    const currentUser = getAdminUser();

    list.innerHTML = pageRows.length
      ? pageRows
          .map((r) => {
            const isMine = r.assignedInvestigatorId && currentUser && r.assignedInvestigatorId === currentUser.id;
            const claimLabel = r.assignedInvestigator
              ? `Claimed by ${isMine ? "you" : escapeReportHtml(r.assignedInvestigator)}`
              : "Unclaimed";
            const claimAction =
              !r.assignedInvestigator
                ? `<button type="button" class="btn report-row__claim-btn" data-claim="${r.id}">Claim</button>`
                : isMine
                  ? `<button type="button" class="btn btn-muted report-row__claim-btn" data-forfeit="${r.id}">Forfeit</button>`
                  : "";
            return `
        <div class="report-row">
          <div class="report-row__top">
            <span class="concern-row__title">${r.incidentType}</span>
            <span class="concern-row__date">${formatReportDate(r.dateSubmitted)}</span>
            <a class="concern-row__link" href="report-detail.html?id=${encodeURIComponent(r.id)}">View Details</a>
            <span class="status-badge ${badgeClass[r.status]}">${r.status}</span>
          </div>
          <div class="report-row__claim">
            <span>${claimLabel}</span>
            ${claimAction}
          </div>
        </div>`;
          })
          .join("")
      : `<div class="ordinances-empty">${liveReports().length ? "No reports match your search or filters." : "No reports submitted yet."}</div>`;

    list.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await claimReport(btn.dataset.claim);
          render();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
    list.querySelectorAll("[data-forfeit]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await forfeitReport(btn.dataset.forfeit);
          render();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });

    const pages = buildPageList(page, totalPages);
    let html = `<button type="button" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
    pages.forEach((p) => {
      html +=
        p === "..."
          ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
          : `<button type="button" data-page="${p}" class="${p === page ? "active" : ""}">${p}</button>`;
    });
    html += `<button type="button" data-page="next" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
    pagination.innerHTML = html;

    pagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        page = val === "prev" ? page - 1 : val === "next" ? page + 1 : Number(val);
        render();
      });
    });
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    page = 1;
    render();
  });
  searchInput.addEventListener("input", () => {
    page = 1;
    render();
  });
  typeFilter.addEventListener("change", () => {
    page = 1;
    render();
  });
  dateFilter.addEventListener("change", () => {
    page = 1;
    render();
  });
  statusFilter.addEventListener("change", () => {
    page = 1;
    render();
  });

  render();
});
