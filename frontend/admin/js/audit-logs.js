// SafeSpace — View Audit Logs: render + sort + filter the login/logout history.
// Data now comes from the real API (see audit-log-data.js) instead of a
// hardcoded array, so this file is async where it fetches logs.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("auditTableBody");
  const sortSelect = document.getElementById("sortSelect");
  const typeFilter = document.getElementById("typeFilter");

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

    const sortValue = sortSelect.value;
    rows = rows.slice().sort((a, b) => {
      if (sortValue === "owner") return a.owner.localeCompare(b.owner);
      if (sortValue === "loggedOff") return new Date(b.loggedOffAt || 0) - new Date(a.loggedOffAt || 0);
      return new Date(b.loggedOnAt) - new Date(a.loggedOnAt);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">No logs match this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (a) => `
        <tr>
          <td>${a.id}</td>
          <td>${a.owner}</td>
          <td>${a.type}</td>
          <td>${a.loggedOnLabel}</td>
          <td>${a.loggedOffLabel}</td>
        </tr>`
      )
      .join("");
  }

  sortSelect.addEventListener("change", render);
  typeFilter.addEventListener("change", render);
  await loadLogs();
});
