// O.R.M.S. — Create Account: creates a real account (Citizen, Staff, or
// Admin) via the API. Accounts made here are pre-verified immediately —
// no voter's ID review — since an admin is creating/vetting it directly.
// This is separate from the Citizen portal's own Sign Up flow, which is
// still how residents self-register (and still goes through Approve
// Accounts for ID verification).

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
  // (Voter's ID upload isn't wired to the backend yet — evidence/file
  // storage is a separate piece of work — so this stays display-only.)
  const idInput = document.getElementById("caIdPhoto");
  const uploadText = document.getElementById("caUploadFileName");
  const defaultUploadText = uploadText.textContent;
  idInput.addEventListener("change", () => {
    const file = idInput.files[0];
    uploadText.textContent = file ? file.name : defaultUploadText;
  });

  const lastName = document.getElementById("caLastName");
  const firstName = document.getElementById("caFirstName");
  const phone = document.getElementById("caPhone");
  const email = document.getElementById("caEmail");
  const address = document.getElementById("caAddress");
  const password = document.getElementById("caPassword");
  const confirmPassword = document.getElementById("caConfirmPassword");

  const createdModal = document.getElementById("accountCreatedModal");
  const createdConfirm = document.getElementById("accountCreatedConfirm");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    if (password.value !== confirmPassword.value) {
      confirmPassword.setCustomValidity("Passwords don't match");
      confirmPassword.reportValidity();
      return;
    }
    confirmPassword.setCustomValidity("");

    clearFormError(form);
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    try {
      const created = await createAccount({
        email: email.value.trim(),
        password: password.value,
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        contactNumber: phone.value.trim(),
        address: address.value.trim(),
        role: accountType.value,
        position: role.value.trim(),
      });

      addAdminNotification(
        `New account created: ${created.first_name} ${created.last_name} (${created.role})`,
        "manage-accounts.html"
      );

      createdModal.hidden = false;
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });

  createdConfirm.addEventListener("click", () => {
    createdModal.hidden = true;
    window.location.href = "manage-accounts.html";
  });
});
