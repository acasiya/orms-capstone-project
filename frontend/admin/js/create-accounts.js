// O.R.M.S. — Create Account: validates the form and confirms with a success
// modal, same pattern as the citizen Sign Up / Edit Profile forms (no
// backend wiring yet).

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("createAccountForm");

  // "Role" only applies to Barangay Officials (e.g. Secretary, Investigator) —
  // stays disabled and empty for Admin/Citizen account types.
  const accountType = document.getElementById("caAccountType");
  const role = document.getElementById("caRole");

  function syncRoleField() {
    const isStaff = accountType.value === "staff";
    role.disabled = !isStaff;
    role.required = isStaff;
    if (!isStaff) role.value = "";
  }

  accountType.addEventListener("change", syncRoleField);
  syncRoleField();

  // Upload dropzone label text: shows the selected filename.
  const idInput = document.getElementById("caIdPhoto");
  const uploadText = document.getElementById("caUploadFileName");
  const defaultUploadText = uploadText.textContent;
  idInput.addEventListener("change", () => {
    const file = idInput.files[0];
    uploadText.textContent = file ? file.name : defaultUploadText;
  });

  const lastName = document.getElementById("caLastName");
  const firstName = document.getElementById("caFirstName");

  const createdModal = document.getElementById("accountCreatedModal");
  const createdConfirm = document.getElementById("accountCreatedConfirm");

  const ACCOUNT_TYPE_LABELS = {
    admin: "Administrator",
    staff: "Barangay Official",
    citizen: "Citizen",
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const typeLabel = accountType.value === "staff" && role.value.trim()
      ? role.value.trim()
      : ACCOUNT_TYPE_LABELS[accountType.value];
    addAdminNotification(
      `New account created: ${firstName.value.trim()} ${lastName.value.trim()} (${typeLabel})`
    );

    createdModal.hidden = false;
  });

  createdConfirm.addEventListener("click", () => {
    createdModal.hidden = true;
    window.location.href = "manage-accounts.html";
  });
});
