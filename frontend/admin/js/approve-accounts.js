// SafeSpace — Approve Accounts: render + filter the pending account list, and
// handle the approve/reject popup + ID photo preview.
// Data now comes from the real API (see pending-accounts-data.js) instead
// of a hardcoded array, so this file is async where it fetches/reviews
// accounts, and the photo preview shows the actual uploaded image.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("pendingTableBody");
  const typeFilter = document.getElementById("typeFilter");

  let accounts = [];

  async function loadAccounts() {
    tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">Loading accounts...</td></tr>`;
    try {
      accounts = await getPendingVerifications();
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td class="admin-table__empty" colspan="5">${err.message}</td></tr>`;
    }
  }

  function render() {
    const filterValue = typeFilter.value;
    const rows = accounts.filter((a) => filterValue === "all" || accountTypeGroup(a.type) === filterValue);

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
  await loadAccounts();

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
  const idPhotoImg = document.getElementById("idPhotoImg");

  let activeAccountId = null;

  function openPhotoPreview(account) {
    idPhotoImg.src = account.photoUrl;
    idPhotoModal.hidden = false;
  }

  tbody.addEventListener("click", (e) => {
    const photoLink = e.target.closest("[data-photo-id]");
    if (photoLink) {
      e.preventDefault();
      const account = accounts.find((a) => a.id === photoLink.dataset.photoId);
      if (account) openPhotoPreview(account);
      return;
    }

    const ownerLink = e.target.closest(".admin-table__owner-link[data-id]");
    if (!ownerLink) return;
    e.preventDefault();

    const account = accounts.find((a) => a.id === ownerLink.dataset.id);
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
      const account = accounts.find((a) => a.id === activeAccountId);
      if (account) openPhotoPreview(account);
    });
  }

  // Shared by the Approve/Reject buttons: calls the given API action for
  // the active account, then drops it from the list on success.
  async function reviewActiveAccount(actionFn, ...args) {
    if (!activeAccountId) return null;
    try {
      await actionFn(activeAccountId, ...args);
      accounts = accounts.filter((a) => a.id !== activeAccountId);
      approveModal.hidden = true;
      render();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  if (approveYesBtn) {
    approveYesBtn.addEventListener("click", async () => {
      approveYesBtn.disabled = true;
      await reviewActiveAccount(approveVerification);
      approveYesBtn.disabled = false;
    });
  }

  // Reject Account popup: asks for a reason (emailed to the applicant, see
  // AdminRejectVerificationView) instead of a plain confirm dialog.
  const rejectReasonModal = document.getElementById("rejectReasonModal");
  const rejectReasonForm = document.getElementById("rejectReasonForm");
  const rejectReasonInput = document.getElementById("rejectReasonInput");
  const rejectReasonCancel = document.getElementById("rejectReasonCancel");

  if (approveNoBtn && rejectReasonModal) {
    approveNoBtn.addEventListener("click", () => {
      rejectReasonInput.value = "";
      rejectReasonModal.hidden = false;
    });
  }

  if (rejectReasonCancel) {
    rejectReasonCancel.addEventListener("click", () => {
      rejectReasonModal.hidden = true;
    });
  }

  if (rejectReasonForm) {
    rejectReasonForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const reason = rejectReasonInput.value.trim();
      if (!reason) return;

      const submitBtn = rejectReasonForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      const ok = await reviewActiveAccount(rejectVerification, reason);
      submitBtn.disabled = false;
      if (ok) rejectReasonModal.hidden = true;
    });
  }
});
