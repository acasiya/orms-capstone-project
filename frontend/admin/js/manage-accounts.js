// O.R.M.S. — Manage Accounts: render + sort + filter the account list.

document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("accountsTableBody");
  const sortSelect = document.getElementById("sortSelect");
  const typeFilter = document.getElementById("typeFilter");

  function render() {
    const filterValue = typeFilter.value;
    let rows = ACCOUNTS.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

    const sortValue = sortSelect.value;
    rows = rows.slice().sort((a, b) => {
      if (sortValue === "owner") return a.owner.localeCompare(b.owner);
      if (sortValue === "recent") return a.activityMinutes - b.activityMinutes;
      return Number(a.id) - Number(b.id);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">No accounts match this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (a) => `
        <tr>
          <td>${a.id}</td>
          <td><a class="admin-table__owner-link" href="#" data-id="${a.id}">${a.owner}</a></td>
          <td>${a.email}</td>
          <td>${a.type}</td>
          <td>${a.active ? '<span class="status-active">Active</span>' : `<span class="status-inactive">${a.lastActiveLabel}</span>`}</td>
        </tr>`
      )
      .join("");
  }

  sortSelect.addEventListener("change", render);
  typeFilter.addEventListener("change", render);
  render();

  // Edit Account popup: opened by clicking an account owner's name
  const editModal = document.getElementById("editAccountModal");
  const editName = document.getElementById("editAccountName");
  const editEmail = document.getElementById("editAccountEmail");
  const editId = document.getElementById("editAccountId");
  const editStatus = document.getElementById("editAccountStatus");
  const editType = document.getElementById("editAccountType");
  const editCreated = document.getElementById("editAccountCreated");
  const editUpdated = document.getElementById("editAccountUpdated");

  tbody.addEventListener("click", (e) => {
    const link = e.target.closest(".admin-table__owner-link");
    if (!link) return;
    e.preventDefault();

    const account = ACCOUNTS.find((a) => a.id === link.dataset.id);
    if (!account || !editModal) return;

    editName.textContent = account.owner;
    editEmail.textContent = account.email;
    editId.textContent = account.id;
    editStatus.textContent = account.active ? "Active" : account.lastActiveLabel;
    editStatus.className = account.active ? "status-active" : "status-inactive";
    editType.textContent = account.type;
    editCreated.textContent = account.created;
    editUpdated.textContent = account.updated;
    editModal.hidden = false;
  });
});
