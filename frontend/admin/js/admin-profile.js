// O.R.M.S. — Admin "My Profile": tab switching, field population from the
// real logged-in session, and Apply Changes/Change Password confirmation.
// Unlike the Citizen/Staff versions, the Admin portal has a real login
// (see js/main.js's apiLogin), so this reads/writes the actual cached
// session instead of a hardcoded mock user.

document.addEventListener("DOMContentLoaded", () => {
  const user = getAdminUser() || {
    name: "Admin",
    firstName: "",
    lastName: "",
    initials: "A",
    email: "",
    mobile: "",
    address: "",
  };

  document.getElementById("editAvatarInitials").textContent = user.initials;
  document.getElementById("passwordAvatar").textContent = user.initials;

  // Profile picture upload preview (Edit Information only)
  const avatarUpload = document.getElementById("avatarUpload");
  const avatarImg = document.getElementById("editAvatarImg");
  const avatarInitials = document.getElementById("editAvatarInitials");
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

  const firstNameInput = document.getElementById("profileFirstName");
  const lastNameInput = document.getElementById("profileLastName");
  const emailInput = document.getElementById("profileEmail");
  const mobileInput = document.getElementById("profileMobile");
  const addressInput = document.getElementById("profileAddress");

  firstNameInput.setAttribute("value", user.firstName || "");
  lastNameInput.setAttribute("value", user.lastName || "");
  emailInput.setAttribute("value", user.email || "");
  mobileInput.setAttribute("value", user.mobile || "");
  addressInput.setAttribute("value", user.address || "");

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

  const editForm = document.getElementById("editProfileForm");
  editForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // Persist the edit into the cached session so the topbar and the
    // profile popup reflect it right away — there's no backend endpoint
    // yet to save this for real.
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const updatedUser = {
      ...user,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      email: emailInput.value.trim(),
      mobile: mobileInput.value.trim(),
      address: addressInput.value.trim(),
      initials: [firstName, lastName]
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    };
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(updatedUser));

    updatedTitle.textContent = "Information Changed!";
    onUpdatedConfirm = () => {
      window.location.href = "manage-accounts.html";
    };
    updatedModal.hidden = false;
  });

  const passwordForm = document.getElementById("changePasswordForm");
  passwordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    updatedTitle.textContent = "Password Changed!";
    onUpdatedConfirm = () => switchToTab("edit");
    updatedModal.hidden = false;
  });
});
