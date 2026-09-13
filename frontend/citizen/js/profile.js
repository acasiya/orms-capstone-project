// SafeSpace — Citizen Profile: tab switching, real field population from the
// API, a real Apply Changes save (including profile picture upload) to
// PATCH /api/auth/me/, and a real Change Password to POST /api/auth/change-password/.

document.addEventListener("DOMContentLoaded", async () => {
  const avatarUpload = document.getElementById("avatarUpload");
  const avatarImg = document.getElementById("editAvatarImg");
  const avatarInitials = document.getElementById("editAvatarInitials");
  const firstNameInput = document.getElementById("profileFirstName");
  const lastNameInput = document.getElementById("profileLastName");
  const emailInput = document.getElementById("profileEmail");
  const mobileInput = document.getElementById("profileMobile");
  const addressInput = document.getElementById("profileAddress");
  const editForm = document.getElementById("editProfileForm");

  function initialsFor(firstName, lastName) {
    return [firstName, lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  // Populates both the form and the avatar preview from a user object —
  // called once with whatever's cached (fast paint), then again once the
  // real API response comes back (in case it's changed since login).
  function populate(user) {
    document.getElementById("passwordAvatar").textContent = user.initials || "";
    if (user.profilePicture) {
      avatarImg.src = user.profilePicture;
      avatarImg.hidden = false;
      avatarInitials.hidden = true;
    } else {
      avatarInitials.textContent = user.initials || "";
      avatarInitials.hidden = false;
      avatarImg.hidden = true;
    }
    firstNameInput.value = user.firstName || "";
    lastNameInput.value = user.lastName || "";
    emailInput.value = user.email || "";
    mobileInput.value = user.mobile || "";
    addressInput.value = user.address || "";
  }

  const cached = getCurrentUser();
  if (cached) populate(cached);

  try {
    const res = await authFetch("/api/auth/me/");
    if (res.ok) {
      const fresh = await res.json();
      populate({
        initials: initialsFor(fresh.first_name, fresh.last_name),
        profilePicture: fresh.profile_picture,
        firstName: fresh.first_name,
        lastName: fresh.last_name,
        email: fresh.email,
        mobile: fresh.contact_number,
        address: fresh.address,
      });
    }
  } catch {
    // Network hiccup — the cached values already painted above are fine to leave.
  }

  // ---- Unsaved-changes tracking ----
  // Snapshotted right after the form is populated from the server, then
  // re-snapshotted after every successful save — isDirty() just compares
  // the live inputs against whichever snapshot is current.
  let savedSnapshot = {
    firstName: firstNameInput.value,
    lastName: lastNameInput.value,
    email: emailInput.value,
    mobile: mobileInput.value,
    address: addressInput.value,
  };

  function isEditDirty() {
    return (
      firstNameInput.value !== savedSnapshot.firstName ||
      lastNameInput.value !== savedSnapshot.lastName ||
      emailInput.value !== savedSnapshot.email ||
      mobileInput.value !== savedSnapshot.mobile ||
      addressInput.value !== savedSnapshot.address ||
      avatarUpload.files.length > 0
    );
  }

  function isPasswordDirty() {
    return !!(currentPasswordInput.value || newPasswordInput.value || confirmNewPasswordInput.value);
  }

  function isDirty() {
    return isEditDirty() || isPasswordDirty();
  }

  // Catch-all for navigation this page doesn't otherwise intercept (navbar
  // links, browser back/refresh/close) — the Cancel button below gets a
  // nicer custom modal instead of this native browser prompt.
  window.addEventListener("beforeunload", (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Profile picture upload preview (Edit Account Information only) — shows the
  // newly-picked file immediately; the actual upload happens on submit.
  avatarUpload.addEventListener("change", () => {
    const file = avatarUpload.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarImg.src = e.target.result;
      avatarImg.hidden = false;
      avatarInitials.hidden = true;
    };
    reader.readAsDataURL(file);
  });

  const tabs = document.querySelectorAll(".profile-tab");
  const views = {
    edit: document.getElementById("editView"),
    password: document.getElementById("passwordView"),
  };

  function switchToTab(key) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === key));
    Object.entries(views).forEach(([k, view]) => {
      view.hidden = k !== key;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchToTab(tab.dataset.tab));
  });

  const updatedModal = document.getElementById("profileUpdatedModal");
  const updatedTitle = document.getElementById("profileUpdatedTitle");
  const updatedConfirm = document.getElementById("profileUpdatedConfirm");
  let onUpdatedConfirm = () => switchToTab("edit");

  updatedConfirm.addEventListener("click", () => {
    updatedModal.hidden = true;
    onUpdatedConfirm();
  });

  // Returns true on success — shared between the form's own submit handler
  // and the unsaved-changes modal's "Save Changes" button.
  async function commitEditSave() {
    clearFormError(editForm);
    const submitBtn = editForm.querySelector('button[type="submit"]');

    const formData = new FormData();
    formData.append("first_name", firstNameInput.value.trim());
    formData.append("last_name", lastNameInput.value.trim());
    formData.append("email", emailInput.value.trim());
    formData.append("contact_number", mobileInput.value.trim());
    formData.append("address", addressInput.value.trim());
    if (avatarUpload.files[0]) formData.append("profile_picture", avatarUpload.files[0]);

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const response = await authFetch("/api/auth/me/", { method: "PATCH", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const firstError = Object.values(data)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not update your profile.");
      }
      const updated = await response.json();

      // Refresh the cached session so the navbar/profile popup reflect the
      // change immediately, without needing to log in again. Writes back to
      // whichever bucket (session/local) the session is actually in — see
      // authStorage() in main.js — rather than always localStorage, or a
      // non-"Stay signed in" session would end up with a stale cached user
      // in sessionStorage and an orphaned copy in localStorage.
      authStorage().setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          ...(getCurrentUser() || {}),
          name: updated.name,
          firstName: updated.first_name,
          lastName: updated.last_name,
          initials: initialsFor(updated.first_name, updated.last_name),
          email: updated.email,
          mobile: updated.contact_number,
          address: updated.address,
          profilePicture: updated.profile_picture,
        })
      );

      savedSnapshot = {
        firstName: firstNameInput.value,
        lastName: lastNameInput.value,
        email: emailInput.value,
        mobile: mobileInput.value,
        address: addressInput.value,
      };
      avatarUpload.value = "";
      return true;
    } catch (err) {
      showFormError(editForm, err.message);
      return false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Apply Changes";
    }
  }

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await commitEditSave()) {
      updatedTitle.textContent = "Information Changed!";
      onUpdatedConfirm = () => {
        window.location.href = "ordinances.html";
      };
      updatedModal.hidden = false;
    }
  });

  const passwordForm = document.getElementById("changePasswordForm");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmNewPasswordInput = document.getElementById("confirmNewPassword");

  async function commitPasswordSave() {
    clearFormError(passwordForm);

    if (newPasswordInput.value !== confirmNewPasswordInput.value) {
      showFormError(passwordForm, "New password and confirm password don't match.");
      return false;
    }

    const submitBtn = passwordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Changing...";
    try {
      const response = await authFetch("/api/auth/change-password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPasswordInput.value,
          new_password: newPasswordInput.value,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const firstError = Object.values(data)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not change your password.");
      }
      passwordForm.reset();
      return true;
    } catch (err) {
      showFormError(passwordForm, err.message);
      return false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Change Password";
    }
  }

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await commitPasswordSave()) {
      updatedTitle.textContent = "Password Changed!";
      onUpdatedConfirm = () => switchToTab("edit");
      updatedModal.hidden = false;
    }
  });

  // ---- Leaving with unsaved changes (Cancel button) ----
  const cancelBtn = document.getElementById("profileCancelBtn");
  const unsavedChangesModal = document.getElementById("unsavedChangesModal");
  const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
  const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
  const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");

  function goToCancelTarget() {
    window.location.href = cancelBtn.getAttribute("href");
  }

  cancelBtn.addEventListener("click", (e) => {
    if (isDirty()) {
      e.preventDefault();
      unsavedChangesModal.hidden = false;
    }
  });
  unsavedSaveBtn.addEventListener("click", async () => {
    unsavedChangesModal.hidden = true;
    const saved = isEditDirty() ? await commitEditSave() : await commitPasswordSave();
    if (saved) goToCancelTarget();
  });
  unsavedDiscardBtn.addEventListener("click", () => {
    unsavedChangesModal.hidden = true;
    goToCancelTarget();
  });
  unsavedCancelBtn.addEventListener("click", () => {
    unsavedChangesModal.hidden = true;
  });
  unsavedChangesModal.addEventListener("click", (e) => {
    if (e.target === unsavedChangesModal) unsavedChangesModal.hidden = true;
  });
});
