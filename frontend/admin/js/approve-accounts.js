// O.R.M.S. — Approve Accounts: render + filter the pending account list, and
// handle the approve/reject popup + ID photo preview.

document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("pendingTableBody");
  const typeFilter = document.getElementById("typeFilter");

  function render() {
    const filterValue = typeFilter.value;
    const rows = PENDING_ACCOUNTS.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">No accounts are waiting for approval.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (a) => `
        <tr>
          <td>${a.id}</td>
          <td><a class="admin-table__owner-link" href="#" data-id="${a.id}">${a.owner}</a></td>
          <td>${a.email}</td>
          <td><a class="admin-table__owner-link" href="#" data-photo-id="${a.id}">View Photo</a></td>
          <td>${a.created}</td>
        </tr>`
      )
      .join("");
  }

  typeFilter.addEventListener("change", render);
  render();

  // Approve Account popup: opened by clicking an account owner's name
  const approveModal = document.getElementById("approveAccountModal");
  const approveName = document.getElementById("approveAccountName");
  const approveEmail = document.getElementById("approveAccountEmail");
  const approveId = document.getElementById("approveAccountId");
  const approveType = document.getElementById("approveAccountType");
  const approveCreated = document.getElementById("approveAccountCreated");
  const approvePhotoLink = document.getElementById("approveAccountPhotoLink");
  const approveYesBtn = document.getElementById("approveAccountYes");
  const approveNoBtn = document.getElementById("approveAccountNo");

  // ID Photo preview popup
  const idPhotoModal = document.getElementById("idPhotoModal");
  const idPhotoFilename = document.getElementById("idPhotoFilename");

  let activeAccountId = null;

  function openPhotoPreview(account) {
    idPhotoFilename.textContent = account.idPhoto;
    idPhotoModal.hidden = false;
  }

  function removePendingAccount(id) {
    const index = PENDING_ACCOUNTS.findIndex((a) => a.id === id);
    if (index !== -1) PENDING_ACCOUNTS.splice(index, 1);
  }

  tbody.addEventListener("click", (e) => {
    const photoLink = e.target.closest("[data-photo-id]");
    if (photoLink) {
      e.preventDefault();
      const account = PENDING_ACCOUNTS.find((a) => a.id === photoLink.dataset.photoId);
      if (account) openPhotoPreview(account);
      return;
    }

    const ownerLink = e.target.closest(".admin-table__owner-link[data-id]");
    if (!ownerLink) return;
    e.preventDefault();

    const account = PENDING_ACCOUNTS.find((a) => a.id === ownerLink.dataset.id);
    if (!account || !approveModal) return;

    activeAccountId = account.id;
    approveName.textContent = account.owner;
    approveEmail.textContent = account.email;
    approveId.textContent = account.id;
    approveType.textContent = account.type;
    approveCreated.textContent = account.created;
    approveModal.hidden = false;
  });

  if (approvePhotoLink) {
    approvePhotoLink.addEventListener("click", (e) => {
      e.preventDefault();
      const account = PENDING_ACCOUNTS.find((a) => a.id === activeAccountId);
      if (account) openPhotoPreview(account);
    });
  }

  if (approveYesBtn) {
    approveYesBtn.addEventListener("click", () => {
      if (activeAccountId) removePendingAccount(activeAccountId);
      approveModal.hidden = true;
      render();
    });
  }

  if (approveNoBtn) {
    approveNoBtn.addEventListener("click", () => {
      if (activeAccountId) removePendingAccount(activeAccountId);
      approveModal.hidden = true;
      render();
    });
  }
});
