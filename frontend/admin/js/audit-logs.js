// O.R.M.S. — View Audit Logs: render + sort + filter the login/logout history.

document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("auditTableBody");
  const sortSelect = document.getElementById("sortSelect");
  const typeFilter = document.getElementById("typeFilter");

  function render() {
    const filterValue = typeFilter.value;
    let rows = AUDIT_LOGS.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

    const sortValue = sortSelect.value;
    rows = rows.slice().sort((a, b) => {
      if (sortValue === "owner") return a.owner.localeCompare(b.owner);
      if (sortValue === "loggedOn") return b.loggedOn.date - a.loggedOn.date;
      if (sortValue === "loggedOff") return b.loggedOff.date - a.loggedOff.date;
      return Number(a.id) - Number(b.id);
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
          <td>${a.loggedOn.label}</td>
          <td>${a.loggedOff.label}</td>
        </tr>`
      )
      .join("");
  }

  sortSelect.addEventListener("change", render);
  typeFilter.addEventListener("change", render);
  render();
});
