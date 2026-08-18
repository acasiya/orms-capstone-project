// O.R.M.S. — Citizen Profile: tab switching, field population, Apply Changes/Change Password confirmation.

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser() || DEMO_USER;

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

  // Set via the attribute (not just the property) so the field's default
  // value is the citizen's real data.
  document.getElementById("profileName").setAttribute("value", user.name);
  document.getElementById("profileEmail").setAttribute("value", user.email);
  document.getElementById("profileMobile").setAttribute("value", user.mobile);
  document.getElementById("profileAddress").setAttribute("value", user.address);

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
      window.location.href = "ordinances.html";
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
