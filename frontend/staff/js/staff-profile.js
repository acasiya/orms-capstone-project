// O.R.M.S. — Staff Profile: tab switching, field population, Apply
// Changes/Change Password confirmation. Mirrors the citizen portal's
// profile.js; edits aren't persisted anywhere since there's no backend yet
// (same as the citizen version — this is a front-end-only mock).

document.addEventListener("DOMContentLoaded", () => {
  const STAFF_USER = {
    name: "Eliseo Aurelio Jr.",
    initials: "EA",
    email: "eliseo.aurelio@binan.gov.ph",
    mobile: "09171234567",
    address: "Barangay Platero, Biñan City, Laguna",
  };

  document.getElementById("editAvatarInitials").textContent = STAFF_USER.initials;
  document.getElementById("passwordAvatar").textContent = STAFF_USER.initials;

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

  document.getElementById("profileName").setAttribute("value", STAFF_USER.name);
  document.getElementById("profileEmail").setAttribute("value", STAFF_USER.email);
  document.getElementById("profileMobile").setAttribute("value", STAFF_USER.mobile);
  document.getElementById("profileAddress").setAttribute("value", STAFF_USER.address);

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
    updatedTitle.textContent = "Information Changed!";
    onUpdatedConfirm = () => {
      window.location.href = "reports-dashboard.html";
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
