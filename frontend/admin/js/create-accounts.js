// SafeSpace — Create Account: Account Type picks which form shows —
// "Barangay Staff" (just an email + role, see AdminCreateUserSerializer)
// or "Barangay Citizen" (full details + password, created and pre-verified
// right away, see AdminCreateCitizenSerializer). Citizens can still
// self-register through the Citizen portal's own Sign Up flow too — this
// is just the admin-direct path for either.

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
  const accountType = document.getElementById("caAccountType");
  const staffForm = document.getElementById("createStaffAccountForm");
  const citizenForm = document.getElementById("createCitizenAccountForm");
  const createdModal = document.getElementById("accountCreatedModal");
  const createdMessage = document.getElementById("accountCreatedMessage");
  const createdConfirm = document.getElementById("accountCreatedConfirm");

  function syncFormVisibility() {
    const isCitizen = accountType.value === "citizen";
    staffForm.hidden = isCitizen;
    citizenForm.hidden = !isCitizen;
  }
  accountType.addEventListener("change", syncFormVisibility);
  syncFormVisibility();

  // ---- Barangay Staff form ----
  const email = document.getElementById("caEmail");
  const role = document.getElementById("caRole");
  const staffSubmitBtn = staffForm.querySelector('button[type="submit"]');

  staffForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!staffForm.reportValidity()) return;

    clearFormError(staffForm);
    staffSubmitBtn.disabled = true;
    staffSubmitBtn.textContent = "Creating...";

    try {
      const created = await createAccount({ email: email.value.trim(), staffRole: role.value });

      addAdminNotification(`New account created: ${created.email} (${role.value})`, "manage-accounts.html");

      createdMessage.textContent = "They can finish setting up their account the first time they log in on the Staff Portal.";
      createdModal.hidden = false;
      staffForm.reset();
      syncFormVisibility();
    } catch (err) {
      showFormError(staffForm, err.message);
    } finally {
      staffSubmitBtn.disabled = false;
      staffSubmitBtn.textContent = "Create Account";
    }
  });

  // ---- Barangay Citizen form ----
  const ccLastName = document.getElementById("ccLastName");
  const ccFirstName = document.getElementById("ccFirstName");
  const ccPhone = document.getElementById("ccPhone");
  const ccEmail = document.getElementById("ccEmail");
  const ccStreet = document.getElementById("ccStreet");
  const ccStreetList = document.getElementById("ccStreetList");
  const ccBlockLot = document.getElementById("ccBlockLot");
  const ccPassword = document.getElementById("ccPassword");
  const ccConfirmPassword = document.getElementById("ccConfirmPassword");
  const citizenSubmitBtn = citizenForm.querySelector('button[type="submit"]');

  // Upload dropzone label text: shows the selected filename.
  // (Voter's ID upload isn't wired to the backend yet — evidence/file
  // storage is a separate piece of work — so this stays display-only.)
  const idInput = document.getElementById("ccIdPhoto");
  const uploadText = document.getElementById("ccUploadFileName");
  const defaultUploadText = uploadText.textContent;
  idInput.addEventListener("change", () => {
    const file = idInput.files[0];
    uploadText.textContent = file ? file.name : defaultUploadText;
  });

  // ---- Street: type-to-filter combobox over the fixed STREETS list ----
  function renderStreetOptions() {
    const query = ccStreet.value.trim().toLowerCase();
    const matches = query ? STREETS.filter((s) => s.toLowerCase().includes(query)) : STREETS;
    ccStreetList.innerHTML = matches.length
      ? matches.map((s) => `<li data-value="${s}">${s}</li>`).join("")
      : `<li class="combobox__empty">No matching street</li>`;
    ccStreetList.hidden = false;
  }
  ccStreet.addEventListener("focus", renderStreetOptions);
  ccStreet.addEventListener("input", renderStreetOptions);
  ccStreetList.addEventListener("click", (e) => {
    const option = e.target.closest("li[data-value]");
    if (!option) return;
    ccStreet.value = option.dataset.value;
    ccStreetList.hidden = true;
  });
  document.addEventListener("click", (e) => {
    if (!ccStreet.contains(e.target) && !ccStreetList.contains(e.target)) {
      ccStreetList.hidden = true;
    }
  });
  ccStreet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ccStreetList.hidden = true;
  });

  // ---- Password requirements: live checkbox feedback ----
  const passwordHint = citizenForm.querySelector(".password-hint");
  function updatePasswordHint() {
    const status = getPasswordRuleStatus(ccPassword.value, {
      firstName: ccFirstName.value,
      lastName: ccLastName.value,
      email: ccEmail.value,
    });
    passwordHint.querySelectorAll("li[data-rule]").forEach((li) => {
      const satisfied = !!status[li.dataset.rule];
      li.classList.toggle("is-satisfied", satisfied);
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = satisfied;
    });
  }
  [ccPassword, ccFirstName, ccLastName, ccEmail].forEach((field) => field.addEventListener("input", updatePasswordHint));
  updatePasswordHint();

  citizenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!citizenForm.reportValidity()) return;

    if (ccPassword.value !== ccConfirmPassword.value) {
      ccConfirmPassword.setCustomValidity("Passwords don't match");
      ccConfirmPassword.reportValidity();
      return;
    }
    ccConfirmPassword.setCustomValidity("");

    clearFormError(citizenForm);

    const passwordError = getPasswordRequirementError(ccPassword.value, {
      firstName: ccFirstName.value,
      lastName: ccLastName.value,
      email: ccEmail.value,
    });
    if (passwordError) {
      showFormError(citizenForm, passwordError);
      return;
    }

    if (!STREETS.includes(ccStreet.value.trim())) {
      showFormError(citizenForm, "Please select a street from the list.");
      return;
    }

    citizenSubmitBtn.disabled = true;
    citizenSubmitBtn.textContent = "Creating...";

    try {
      const created = await createCitizenAccount({
        email: ccEmail.value.trim(),
        password: ccPassword.value,
        firstName: ccFirstName.value.trim(),
        lastName: ccLastName.value.trim(),
        contactNumber: ccPhone.value.trim(),
        address: `${ccBlockLot.value.trim()}, ${ccStreet.value.trim()}`,
      });

      addAdminNotification(`New account created: ${created.first_name} ${created.last_name} (Barangay Citizen)`, "manage-accounts.html");

      createdMessage.textContent = "The account is ready to log in on the Citizen Portal right away.";
      createdModal.hidden = false;
      citizenForm.reset();
      uploadText.textContent = defaultUploadText;
      updatePasswordHint();
    } catch (err) {
      showFormError(citizenForm, err.message);
    } finally {
      citizenSubmitBtn.disabled = false;
      citizenSubmitBtn.textContent = "Create Account";
    }
  });

  createdConfirm.addEventListener("click", () => {
    createdModal.hidden = true;
    window.location.href = "manage-accounts.html";
  });
});
