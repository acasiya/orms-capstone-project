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
  const editDisableBtn = document.getElementById("editDisableBtn");
  const editTypeBtn = document.getElementById("editTypeBtn");
  const editResetBtn = document.getElementById("editResetBtn");

  let activeAccount = null;

  function populateEditModal(account) {
    editName.textContent = account.owner;
    editEmail.textContent = account.email;
    editId.textContent = account.id;
    editStatus.textContent = account.active ? "Active" : account.lastActiveLabel;
    editStatus.className = account.active ? "status-active" : "status-inactive";
    editType.textContent = account.type;
    editCreated.textContent = account.created;
    editUpdated.textContent = account.updated;
    editDisableBtn.innerHTML = account.active ? "&#128683; Disable User" : "&#9989; Enable User";
  }

  tbody.addEventListener("click", (e) => {
    const link = e.target.closest(".admin-table__owner-link");
    if (!link) return;
    e.preventDefault();

    const account = ACCOUNTS.find((a) => a.id === link.dataset.id);
    if (!account || !editModal) return;

    activeAccount = account;
    populateEditModal(account);
    editModal.hidden = false;
  });

  // Disable/Enable User: toggles the account's active status right in the mock list.
  editDisableBtn.addEventListener("click", () => {
    if (!activeAccount) return;
    activeAccount.active = !activeAccount.active;
    if (!activeAccount.active) activeAccount.lastActiveLabel = "Just Now";
    activeAccount.updated = "Just Now";
    populateEditModal(activeAccount);
    render();
  });

  // Update User Type popup
  const updateTypeModal = document.getElementById("updateTypeModal");
  const updateTypeSelect = document.getElementById("updateTypeSelect");
  const updateTypeSave = document.getElementById("updateTypeSave");

  editTypeBtn.addEventListener("click", () => {
    if (!activeAccount) return;
    updateTypeSelect.value = activeAccount.type;
    editModal.hidden = true;
    updateTypeModal.hidden = false;
  });

  updateTypeSave.addEventListener("click", () => {
    if (!activeAccount) return;
    activeAccount.type = updateTypeSelect.value;
    activeAccount.updated = "Just Now";
    updateTypeModal.hidden = true;
    populateEditModal(activeAccount);
    editModal.hidden = false;
    render();
  });

  // Cancelling (X or Cancel button, or clicking the backdrop) returns to the
  // Edit Account popup instead of leaving nothing open.
  updateTypeModal.addEventListener("click", (e) => {
    if (e.target === updateTypeModal || e.target.closest("[data-close-modal]")) {
      editModal.hidden = false;
    }
  });

  // Reset Password confirmation (mock — no backend to send a real email yet)
  const resetPasswordModal = document.getElementById("resetPasswordModal");
  const resetPasswordText = document.getElementById("resetPasswordText");

  editResetBtn.addEventListener("click", () => {
    if (!activeAccount) return;
    resetPasswordText.textContent = `Password reset link sent to ${activeAccount.email}`;
    editModal.hidden = true;
    resetPasswordModal.hidden = false;
  });

  resetPasswordModal.addEventListener("click", (e) => {
    if (e.target === resetPasswordModal || e.target.closest("[data-close-modal]")) {
      editModal.hidden = false;
    }
  });
});
