// O.R.M.S. — shared behavior for admin pages (sidebar toggle + logout).

const ADMIN_AUTH_STORAGE_KEY = "orms_auth_user";
const ADMIN_ACCESS_TOKEN_KEY = "orms_access_token";
const ADMIN_REFRESH_TOKEN_KEY = "orms_refresh_token";

// This script is only ever loaded by pages inside /staff/, so the portal is
// fixed. Every page that loads admin.js is a logged-in-only page (the
// login/forgot-password/reset pages load main.js instead), so bounce back
// to the login page unless there's a valid token AND the cached user is
// actually a Barangay Official — otherwise an Administrator's (or a stale/
// leftover) session could land straight on the Staff Portal unchecked.
function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

(function enforceStaffPortalAccess() {
  const user = getAdminUser();
  const hasToken = !!localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
  if (!hasToken || !user || user.role !== "staff") {
    window.location.href = "index.html";
  }
})();

// Attaches the stored JWT to a fetch call. Same helper as main.js's
// authFetch (duplicated here rather than shared, since admin.js and
// main.js are never loaded on the same page). Every authenticated staff
// API call should go through this.
async function authFetch(path, options = {}) {
  const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  return fetch(path, { ...options, headers });
}

// Shows/clears an inline error message below a form. Same pattern as main.js.
function showFormError(form, message) {
  let errEl = form.querySelector(".form-error");
  if (!errEl) {
    errEl = document.createElement("p");
    errEl.className = "form-error";
    errEl.style.color = "#c0392b";
    errEl.style.marginTop = "0.5rem";
    errEl.style.fontSize = "0.9rem";
    form.appendChild(errEl);
  }
  errEl.textContent = message;
}

function clearFormError(form) {
  const errEl = form.querySelector(".form-error");
  if (errEl) errEl.remove();
}

// Renders a real uploaded profile picture into an avatar container (the
// topbar avatar, the profile popup avatar, etc.) when one exists, falling
// back to initials — used everywhere a placeholder profile picture
// appears, so uploading a photo on My Profile shows up everywhere at once.
function renderAvatar(container, user) {
  if (!container) return;
  if (user && user.profilePicture) {
    container.innerHTML = `<img class="avatar-img" src="${user.profilePicture}" alt="" />`;
  } else if (user && user.initials) {
    container.textContent = user.initials;
  }
}

function accountTypeGroup(type) {
  if (type === "Administrator") return "admin";
  if (type === "Barangay Citizen") return "citizen";
  return "staff";
}

document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".admin-sidebar");
  const shell = document.querySelector(".admin-shell");

  if (sidebarToggle && sidebar && shell) {
    // A dimmed backdrop behind the mobile drawer — created here rather than
    // added to every HTML page, since it's only relevant below 900px (see
    // .admin-sidebar-backdrop in style.css).
    const backdrop = document.createElement("div");
    backdrop.className = "admin-sidebar-backdrop";
    shell.appendChild(backdrop);

    const closeSidebar = () => {
      sidebar.classList.remove("is-collapsed");
      backdrop.classList.remove("is-visible");
    };

    sidebarToggle.addEventListener("click", () => {
      const isOpening = !sidebar.classList.contains("is-collapsed");
      sidebar.classList.toggle("is-collapsed");
      if (window.matchMedia("(max-width: 900px)").matches) {
        backdrop.classList.toggle("is-visible", isOpening);
      }
    });

    backdrop.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSidebar();
    });

    sidebar.querySelectorAll(".admin-sidebar__nav a").forEach((link) => {
      link.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 900px)").matches) closeSidebar();
      });
    });
  }

  const logoutConfirmModal = document.getElementById("logoutConfirmModal");
  const logoutYes = document.getElementById("logoutYes");
  const logoutNo = document.getElementById("logoutNo");

  // Both the sidebar's Logout button and the profile popup's Log Out button
  // (when present) open the same confirmation modal.
  [document.getElementById("logoutBtn"), document.getElementById("profileLogoutBtn")].forEach((btn) => {
    if (btn && logoutConfirmModal) {
      btn.addEventListener("click", () => {
        logoutConfirmModal.hidden = false;
      });
    }
  });
  if (logoutYes) {
    logoutYes.addEventListener("click", async () => {
      // Closes out the LoginSession for View Audit Logs — best-effort, since
      // the local session should clear either way. Must happen before the
      // token authFetch needs to authenticate this gets removed below.
      try {
        await authFetch("/api/auth/logout/", { method: "POST" });
      } catch {
        // ignore — logging out locally still proceeds below
      }
      localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
      localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
      localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
      window.location.href = "index.html";
    });
  }
  if (logoutNo) {
    logoutNo.addEventListener("click", () => {
      logoutConfirmModal.hidden = true;
    });
  }

  // Topbar name/role/avatar + the profile popup both reflect whoever is
  // actually logged in (rather than the hardcoded "Eliseo Aurelio Jr." /
  // "Barangay Chairman" placeholder this used to ship with), so an edit
  // made on My Profile shows up everywhere right away.
  const user = getAdminUser();
  if (user) {
    document.querySelectorAll(".admin-topbar__name strong").forEach((el) => {
      el.textContent = user.name;
    });
    document.querySelectorAll(".admin-topbar__name small").forEach((el) => {
      el.textContent = user.position || "Barangay Official";
    });
    document.querySelectorAll(".admin-topbar__avatar").forEach((el) => renderAvatar(el, user));
    document.getElementById("profileCardName") && (document.getElementById("profileCardName").textContent = user.name);
    document.getElementById("profileCardRole") && (document.getElementById("profileCardRole").textContent = user.position || "Barangay Official");
    renderAvatar(document.getElementById("profileCardInitials"), user);
  }

  const profileBtn = document.getElementById("profileBtn");
  const profileModal = document.getElementById("profileModal");
  if (profileBtn && profileModal) {
    profileBtn.addEventListener("click", () => {
      profileModal.hidden = false;
    });
  }

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-overlay").hidden = true;
    });
  });
});
