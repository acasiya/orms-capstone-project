// SafeSpace — Admin "My Profile": tab switching, real field population from
// the API, and a real Apply Changes save (including profile picture
// upload) to PATCH /api/auth/me/. Change Password stays a front-end-only
// mock — no backend endpoint for that yet.

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

  const cached = getAdminUser();
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

  // Profile picture upload preview (Edit Information only) — shows the
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

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
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

      // Refresh the cached session so the topbar/profile popup reflect the
      // change immediately, without needing to log in again. Writes back to
      // whichever bucket (session/local) the session is actually in — see
      // adminAuthStorage() in admin.js.
      adminAuthStorage().setItem(
        ADMIN_AUTH_STORAGE_KEY,
        JSON.stringify({
          ...(getAdminUser() || {}),
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

      updatedTitle.textContent = "Information Changed!";
      onUpdatedConfirm = () => {
        window.location.href = "manage-accounts.html";
      };
      updatedModal.hidden = false;
    } catch (err) {
      showFormError(editForm, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Apply Changes";
    }
  });

  const passwordForm = document.getElementById("changePasswordForm");
  passwordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    updatedTitle.textContent = "Password Changed!";
    onUpdatedConfirm = () => switchToTab("edit");
    updatedModal.hidden = false;
  });
});
