// SafeSpace — Create Account: creates a real account (Citizen, Staff, or
// Admin) via the API. Accounts made here are pre-verified immediately —
// no voter's ID review — since an admin is creating/vetting it directly.
// This is separate from the Citizen portal's own Sign Up flow, which is
// still how residents self-register (and still goes through Approve
// Accounts for ID verification).

// Same client-checkable password rules as Citizen Sign Up (frontend/citizen/js/main.js) —
// kept here too since this page loads admin.js rather than main.js.
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "123456789", "12345",
  "1234567890", "1234567", "password1", "111111", "iloveyou", "1234",
  "abc123", "123123", "qwerty123", "welcome", "admin123", "letmein",
  "monkey123", "login", "princess", "solo123", "starwars", "dragon",
  "passw0rd", "master", "hello123", "freedom", "whatever", "qazwsx",
  "trustno1", "000000", "football", "baseball", "shadow123", "michael1",
  "superman1", "batman123", "charlie1", "jordan23", "harley123",
  "hunter123", "ranger123", "buster123", "soccer123", "hockey123",
  "computer1", "jessica1", "pepper123", "1qaz2wsx", "flower123",
]);

function getPasswordRuleStatus(pw, attrs = {}) {
  const lowerPw = pw.toLowerCase();
  const candidates = [attrs.firstName, attrs.lastName, (attrs.email || "").split("@")[0]].filter(Boolean);
  const tooSimilar = candidates.some((candidate) => {
    const lowerCandidate = candidate.toLowerCase().trim();
    return lowerCandidate.length >= 3 && (lowerPw.includes(lowerCandidate) || lowerCandidate.includes(lowerPw));
  });
  return {
    length: pw.length >= 8,
    numeric: pw.length > 0 && !/^\d+$/.test(pw),
    common: pw.length > 0 && !COMMON_PASSWORDS.has(lowerPw),
    similar: pw.length > 0 && !tooSimilar,
  };
}

function getPasswordRequirementError(pw, attrs = {}) {
  const status = getPasswordRuleStatus(pw, attrs);
  if (!status.length) return "Password must be at least 8 characters.";
  if (!status.numeric) return "Password can't be entirely numbers.";
  if (!status.common) return "That password is too common. Please choose a less predictable one.";
  if (!status.similar) return "Password is too similar to the account's name or email.";
  return null;
}

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
  const street = document.getElementById("caStreet");
  const streetList = document.getElementById("caStreetList");
  const blockLot = document.getElementById("caBlockLot");
  const password = document.getElementById("caPassword");
  const confirmPassword = document.getElementById("caConfirmPassword");

  const createdModal = document.getElementById("accountCreatedModal");
  const createdConfirm = document.getElementById("accountCreatedConfirm");
  const submitBtn = form.querySelector('button[type="submit"]');

  // ---- Street: type-to-filter combobox over the fixed STREETS list ----
  function renderStreetOptions() {
    const query = street.value.trim().toLowerCase();
    const matches = query ? STREETS.filter((s) => s.toLowerCase().includes(query)) : STREETS;
    streetList.innerHTML = matches.length
      ? matches.map((s) => `<li data-value="${s}">${s}</li>`).join("")
      : `<li class="combobox__empty">No matching street</li>`;
    streetList.hidden = false;
  }
  street.addEventListener("focus", renderStreetOptions);
  street.addEventListener("input", renderStreetOptions);
  streetList.addEventListener("click", (e) => {
    const option = e.target.closest("li[data-value]");
    if (!option) return;
    street.value = option.dataset.value;
    streetList.hidden = true;
  });
  document.addEventListener("click", (e) => {
    if (!street.contains(e.target) && !streetList.contains(e.target)) {
      streetList.hidden = true;
    }
  });
  street.addEventListener("keydown", (e) => {
    if (e.key === "Escape") streetList.hidden = true;
  });

  // ---- Password requirements: live checkbox feedback ----
  const passwordHint = form.querySelector(".password-hint");
  function updatePasswordHint() {
    const status = getPasswordRuleStatus(password.value, {
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
    });
    passwordHint.querySelectorAll("li[data-rule]").forEach((li) => {
      const satisfied = !!status[li.dataset.rule];
      li.classList.toggle("is-satisfied", satisfied);
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = satisfied;
    });
  }
  [password, firstName, lastName, email].forEach((field) => field.addEventListener("input", updatePasswordHint));
  updatePasswordHint();

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

    const passwordError = getPasswordRequirementError(password.value, {
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
    });
    if (passwordError) {
      showFormError(form, passwordError);
      return;
    }

    if (!STREETS.includes(street.value.trim())) {
      showFormError(form, "Please select a street from the list.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    try {
      const created = await createAccount({
        email: email.value.trim(),
        password: password.value,
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        contactNumber: phone.value.trim(),
        address: `${blockLot.value.trim()}, ${street.value.trim()}`,
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
