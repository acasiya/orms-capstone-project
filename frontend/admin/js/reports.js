// SafeSpace — Admin Portal "Reports" page: every unclaimed report, oldest
// first, with an inline "Assign to Investigator" control per row — lets an
// Administrator hand a report straight to a specific Investigator instead
// of leaving it for one to self-claim (see reports.StaffReportAssignView).
// Deliberately just this one list rather than the full Reports Dashboard
// (graphs/stats) — assigning work is the one thing only an Administrator
// can do here that an Investigator/Captain's own pages don't already cover.

const REPORT_STATUS_LABEL = {
  submitted: "New Submission",
  under_review: "Under Review",
  in_action: "In Action",
  resolved: "Resolved",
};

const REPORT_STATUS_BADGE_CLASS = {
  submitted: "status-badge--submitted",
  under_review: "status-badge--in-process",
  in_action: "status-badge--with-remarks",
  resolved: "status-badge--resolved",
};

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("unclaimedReportsBody");
  const pagination = document.getElementById("unclaimedReportsPagination");
  const searchForm = document.getElementById("reportSearchForm");
  const searchInput = document.getElementById("reportSearchInput");

  const PAGE_SIZE = 10;
  let reports = [];
  let investigators = [];
  let page = 1;
  let appliedQuery = "";

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  async function loadData() {
    tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">Loading reports...</td></tr>`;
    try {
      const [reportsRes, usersRes] = await Promise.all([
        authFetch("/api/reports/staff/"),
        authFetch("/api/auth/admin/users/"),
      ]);
      if (!reportsRes.ok) throw new Error("Could not load reports.");
      const allReports = await reportsRes.json();
      reports = allReports
        .filter((r) => !r.assignedInvestigatorId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      investigators = usersRes.ok
        ? (await usersRes.json()).filter((u) => u.position === "Investigator" && u.active)
        : [];

      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function assignControlHtml(report) {
    if (!investigators.length) {
      return `<span style="color:var(--text-muted);">No active Investigators</span>`;
    }
    return `
      <div class="assign-row">
        <select data-assign-select="${report.id}">
          ${investigators.map((inv) => `<option value="${inv.id}">${escapeHtml(inv.owner)}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-muted" data-assign-btn="${report.id}">Assign</button>
      </div>`;
  }

  function render() {
    let rows = reports;
    if (appliedQuery) {
      rows = rows.filter(
        (r) =>
          (r.reporter || "").toLowerCase().includes(appliedQuery) ||
          (r.ordinance || "").toLowerCase().includes(appliedQuery)
      );
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    renderPaginationControls(pagination, page, totalPages, (n) => {
      page = n;
      render();
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">No unclaimed reports${appliedQuery ? " match this search" : ""}.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageRows
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.reporter)}</td>
          <td>${escapeHtml(r.ordinance)}</td>
          <td>${formatDate(r.created_at)}</td>
          <td><span class="status-badge ${REPORT_STATUS_BADGE_CLASS[r.status] || ""}">${escapeHtml(REPORT_STATUS_LABEL[r.status] || r.status)}</span></td>
          <td>${assignControlHtml(r)}</td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-assign-btn]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const reportId = btn.dataset.assignBtn;
        const select = tbody.querySelector(`[data-assign-select="${reportId}"]`);
        const investigatorId = select.value;
        const investigatorName = select.options[select.selectedIndex].textContent;
        if (!(await siteConfirm(`Assign this report to ${investigatorName}?`))) return;

        btn.disabled = true;
        try {
          const response = await authFetch(`/api/reports/staff/${encodeURIComponent(reportId)}/assign/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ investigator_id: investigatorId }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.detail || "Could not assign this report.");
          }
          reports = reports.filter((r) => r.id !== reportId);
          render();
        } catch (err) {
          siteAlert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    appliedQuery = searchInput.value.trim().toLowerCase();
    page = 1;
    render();
  });

  await loadData();
});
