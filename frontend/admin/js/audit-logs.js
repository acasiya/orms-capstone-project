// SafeSpace — View Audit Logs: render + search + sort + filter every logged
// action (not just login/logout — see AuditLog/log_action on the backend).
// Data comes from the real API (see audit-log-data.js).

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("auditTableBody");
  const sortSelect = document.getElementById("sortSelect");
  const typeFilter = document.getElementById("typeFilter");
  const searchForm = document.getElementById("auditSearchForm");
  const searchInput = document.getElementById("auditSearchInput");

  let logs = [];

  async function loadLogs() {
    tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">Loading audit logs...</td></tr>`;
    try {
      logs = await getAuditLogs();
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">${err.message}</td></tr>`;
    }
  }

  function render() {
    const filterValue = typeFilter.value;
    let rows = logs.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (a) =>
          a.owner.toLowerCase().includes(query) ||
          a.action.toLowerCase().includes(query) ||
          a.timeLabel.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query)
      );
    }

    const sortValue = sortSelect.value;
    rows = rows.slice().sort((a, b) => {
      if (sortValue === "owner") return a.owner.localeCompare(b.owner);
      if (sortValue === "id") return a.accountId.localeCompare(b.accountId);
      return new Date(b.timeAt) - new Date(a.timeAt);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">No logs match this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (a) => `
        <tr>
          <td>${a.accountId}</td>
          <td>${a.owner}</td>
          <td>${a.type}</td>
          <td>${a.timeLabel}</td>
          <td>${a.action}</td>
        </tr>`
      )
      .join("");
  }

  sortSelect.addEventListener("change", render);
  typeFilter.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  await loadLogs();
});
