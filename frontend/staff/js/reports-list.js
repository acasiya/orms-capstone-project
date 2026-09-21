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
  let pageSize = 5;

  const searchForm = document.getElementById("reportSearchForm");
  const searchInput = document.getElementById("reportSearchInput");
  const typeFilter = document.getElementById("typeFilter");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");
  const dateRangeClear = document.getElementById("dateRangeClear");
  const statusFilter = document.getElementById("statusFilter");
  const list = document.getElementById("reportsList");
  const pagination = document.getElementById("reportsPagination");
  const pageSizeSelect = document.getElementById("reportsPageSize");

  let page = 1;
  let statusFilterTouched = false;

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

  // No check-in/check-out picked yet: default to today's reports plus any
  // older report that's still unresolved, rather than the whole queue —
  // this is what an Investigator needs to see first thing on login, without
  // having to remember to filter for it.
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function getDefaultRows() {
    const today = new Date();
    return liveReports().filter((r) => isSameDay(r.dateSubmitted, today) || r.status !== "Resolved");
  }

  function getFiltered() {
    let rows;
    if (!dateFrom.value && !dateTo.value) {
      rows = getDefaultRows();
    } else {
      rows = liveReports().filter((r) => {
        if (dateFrom.value && r.dateSubmitted < new Date(`${dateFrom.value}T00:00:00`)) return false;
        if (dateTo.value && r.dateSubmitted > new Date(`${dateTo.value}T23:59:59`)) return false;
        return true;
      });
    }

    if (typeFilter.value !== "all") {
      rows = rows.filter((r) => r.incidentType === typeFilter.value);
    }
    // Resolved reports stay out of the queue until the status filter is
    // actually touched — even re-picking "Status" (all) counts, since
    // that's an explicit "yes, show everything" action.
    if (!statusFilterTouched && statusFilter.value === "all") {
      rows = rows.filter((r) => r.status !== "Resolved");
    } else if (statusFilter.value !== "all") {
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
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

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

    renderPaginationControls(pagination, page, totalPages, (n) => {
      page = n;
      render();
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
  dateFrom.addEventListener("change", () => {
    // Check-in can't land after check-out — keep the range sane instead of
    // silently returning zero results.
    if (dateTo.value && dateFrom.value > dateTo.value) dateTo.value = dateFrom.value;
    page = 1;
    render();
  });
  dateTo.addEventListener("change", () => {
    if (dateFrom.value && dateTo.value < dateFrom.value) dateFrom.value = dateTo.value;
    page = 1;
    render();
  });
  dateRangeClear.addEventListener("click", () => {
    dateFrom.value = "";
    dateTo.value = "";
    page = 1;
    render();
  });
  statusFilter.addEventListener("change", () => {
    statusFilterTouched = true;
    page = 1;
    render();
  });

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      pageSize = Number(pageSizeSelect.value);
      page = 1;
      render();
    });
  }

  render();
});
