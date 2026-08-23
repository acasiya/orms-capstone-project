// O.R.M.S. — Manage Accounts: render + sort + filter the account list.
// Data now comes from the real API (see accounts-data.js) instead of a
// hardcoded array, so this file is async where it fetches/updates accounts.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("accountsTableBody");
  const sortSelect = document.getElementById("sortSelect");
  const typeFilter = document.getElementById("typeFilter");

  let accounts = [];

  async function loadAccounts() {
    tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">Loading accounts...</td></tr>`;
    try {
      accounts = await getAllAccounts();
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">${err.message}</td></tr>`;
    }
  }

  function render() {
    const filterValue = typeFilter.value;
    let rows = accounts.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

    const sortValue = sortSelect.value;
    rows = rows.slice().sort((a, b) => {
      if (sortValue === "owner") return a.owner.localeCompare(b.owner);
      if (sortValue === "recent") return a.activityMinutes - b.activityMinutes;
      // Account IDs are UUIDs (not sequential numbers), so "Newest" sorts
      // by join date instead of trying to compare IDs numerically.
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
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
  await loadAccounts();

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

    // Admins can't disable or change the type of their own account — see
    // the matching safeguard in AdminAccountDetailView.patch. Shown as a
    // disabled button here so it's clear upfront, not just after a failed click.
    const isSelf = account.id === (getAdminUser() || {}).id;
    editDisableBtn.disabled = isSelf && account.active;
    editDisableBtn.title = isSelf && account.active ? "You can't disable your own account." : "";
    editTypeBtn.disabled = isSelf;
    editTypeBtn.title = isSelf ? "You can't change your own account type." : "";
  }

  tbody.addEventListener("click", (e) => {
    const link = e.target.closest(".admin-table__owner-link");
    if (!link) return;
    e.preventDefault();

    const account = accounts.find((a) => a.id === link.dataset.id);
    if (!account || !editModal) return;

    activeAccount = account;
    populateEditModal(account);
    editModal.hidden = false;
  });

  // Disable/Enable User: PATCHes is_active on the real account. A disabled
  // account is rejected by the backend on their next request too, not just
  // hidden here — see AdminAccountDetailView.patch in accounts/views.py.
  editDisableBtn.addEventListener("click", async () => {
    if (!activeAccount) return;
    const previousLabel = editDisableBtn.innerHTML;
    editDisableBtn.disabled = true;
    editDisableBtn.textContent = "Saving...";
    try {
      const updated = await updateAccount(activeAccount.id, { active: !activeAccount.active });
      Object.assign(activeAccount, updated);
      populateEditModal(activeAccount);
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      editDisableBtn.disabled = false;
      editDisableBtn.innerHTML = previousLabel;
    }
  });

  // Update User Type popup
  const updateTypeModal = document.getElementById("updateTypeModal");
  const updateTypeSelect = document.getElementById("updateTypeSelect");
  const updateTypeSave = document.getElementById("updateTypeSave");

  // Maps the dropdown's display labels to the backend's role/position pair.
  // "Administrator" and "Barangay Citizen" set role only; anything else is
  // treated as a Staff position (role="staff", position=<the label>).
  function labelToRoleAndPosition(label) {
    if (label === "Administrator") return { role: "admin", position: "" };
    if (label === "Barangay Citizen") return { role: "citizen", position: "" };
    return { role: "staff", position: label };
  }

  editTypeBtn.addEventListener("click", () => {
    if (!activeAccount) return;
    updateTypeSelect.value = activeAccount.type;
    editModal.hidden = true;
    updateTypeModal.hidden = false;
  });

  updateTypeSave.addEventListener("click", async () => {
    if (!activeAccount) return;
    updateTypeSave.disabled = true;
    try {
      const updated = await updateAccount(activeAccount.id, labelToRoleAndPosition(updateTypeSelect.value));
      Object.assign(activeAccount, updated);
      updateTypeModal.hidden = true;
      populateEditModal(activeAccount);
      editModal.hidden = false;
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      updateTypeSave.disabled = false;
    }
  });

  // Cancelling (X or Cancel button, or clicking the backdrop) returns to the
  // Edit Account popup instead of leaving nothing open.
  updateTypeModal.addEventListener("click", (e) => {
    if (e.target === updateTypeModal || e.target.closest("[data-close-modal]")) {
      editModal.hidden = false;
    }
  });

  // Reset Password confirmation — generates a real reset token server-side.
  // NOTE: no email service is wired up yet, so nothing is actually sent to
  // the user's inbox — see AdminResetPasswordView's docstring.
  const resetPasswordModal = document.getElementById("resetPasswordModal");
  const resetPasswordText = document.getElementById("resetPasswordText");

  editResetBtn.addEventListener("click", async () => {
    if (!activeAccount) return;
    editResetBtn.disabled = true;
    try {
      await resetAccountPassword(activeAccount.id);
      resetPasswordText.textContent = `Password reset link sent to ${activeAccount.email}`;
      editModal.hidden = true;
      resetPasswordModal.hidden = false;
    } catch (err) {
      alert(err.message);
    } finally {
      editResetBtn.disabled = false;
    }
  });

  resetPasswordModal.addEventListener("click", (e) => {
    if (e.target === resetPasswordModal || e.target.closest("[data-close-modal]")) {
      editModal.hidden = false;
    }
  });
});
