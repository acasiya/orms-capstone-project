// O.R.M.S. — shared behavior for admin pages (sidebar toggle + logout).

const ADMIN_AUTH_STORAGE_KEY = "orms_auth_user";
const ADMIN_ACCESS_TOKEN_KEY = "orms_access_token";
const ADMIN_REFRESH_TOKEN_KEY = "orms_refresh_token";

// This script is only ever loaded by pages inside /admin/, so the portal is
// fixed. Every page that loads admin.js is a logged-in-only page (the
// login/forgot-password/reset pages load main.js instead), so bounce back
// to the login page unless there's a valid token AND the cached user is
// actually an Administrator — otherwise a Barangay Official's (or a stale/
// leftover) session could land straight on the Admin Portal unchecked.
function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

(function enforceAdminPortalAccess() {
  const user = getAdminUser();
  const hasToken = !!localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
  if (!hasToken || !user || user.role !== "admin") {
    window.location.href = "index.html";
  }
})();

function accountTypeGroup(type) {
  if (type === "Administrator") return "admin";
  if (type === "Barangay Citizen") return "citizen";
  return "staff";
}

// ---- Notifications (bell icon in the topbar) ----
// Stored in localStorage (rather than an in-memory array) so a notification
// added on one admin page — e.g. Create Account — is still there after
// navigating to another admin page.
const ADMIN_NOTIFICATIONS_KEY = "orms_admin_notifications";
const ADMIN_NOTIFICATIONS_MAX = 20;

function getAdminNotifications() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_NOTIFICATIONS_KEY)) || [];
  } catch {
    return [];
  }
}

// Called from other admin pages (e.g. Create Account) to raise a notification.
function addAdminNotification(message) {
  const notifications = getAdminNotifications();
  notifications.unshift({ message, time: Date.now() });
  localStorage.setItem(
    ADMIN_NOTIFICATIONS_KEY,
    JSON.stringify(notifications.slice(0, ADMIN_NOTIFICATIONS_MAX))
  );
}

function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".admin-sidebar");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("is-collapsed");
    });
  }

  // Topbar name + the profile popup both reflect whoever is actually logged
  // in (rather than a hardcoded placeholder), so an edit made on the My
  // Profile page shows up everywhere right away.
  const user = getAdminUser();
  if (user) {
    document.querySelectorAll(".admin-topbar__name strong").forEach((el) => {
      el.textContent = user.name;
    });
    document.getElementById("profileCardName") && (document.getElementById("profileCardName").textContent = user.name);
    document.getElementById("profileCardInitials") && (document.getElementById("profileCardInitials").textContent = user.initials);
  }

  const profileBtn = document.getElementById("profileBtn");
  const profileModal = document.getElementById("profileModal");
  if (profileBtn && profileModal) {
    profileBtn.addEventListener("click", () => {
      profileModal.hidden = false;
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
    logoutYes.addEventListener("click", () => {
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

  // Bell icon: toggles the notifications dropdown anchored beneath it
  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifBadge = document.getElementById("notifBadge");
  const notifList = document.getElementById("notifList");

  if (notifBell && notifDropdown && notifList) {
    const renderNotifications = () => {
      const notifications = getAdminNotifications();
      notifBadge.hidden = notifications.length === 0;
      notifList.innerHTML = notifications.length
        ? notifications
            .map(
              (n) => `
              <li class="notif-dropdown__item">
                <span>${n.message}</span>
                <span class="notif-dropdown__time">${timeAgo(n.time)}</span>
              </li>`
            )
            .join("")
        : `<li class="notif-dropdown__item">No notifications yet</li>`;
    };
    renderNotifications();

    const toggleNotifDropdown = () => {
      notifDropdown.hidden = !notifDropdown.hidden;
      if (!notifDropdown.hidden) renderNotifications();
    };
    notifBell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotifDropdown();
    });
    notifBell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleNotifDropdown();
      }
    });
    document.addEventListener("click", (e) => {
      if (!notifDropdown.hidden && !notifBell.contains(e.target)) {
        notifDropdown.hidden = true;
      }
    });
  }
});
