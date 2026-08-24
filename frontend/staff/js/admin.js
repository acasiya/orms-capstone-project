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

// ---- Notifications (bell icon in the topbar) ----
// New report/concern submissions raise a notification automatically (no
// opt-in — this is core to the job, unlike the Admin portal's broader
// account/login notifications). Stored in localStorage so a notification
// raised on one page is still there after navigating to another. Uses its
// own key, distinct from the Admin portal's "orms_admin_notifications" —
// localStorage is shared across the whole site (same origin regardless of
// /admin/ vs /staff/), so a shared key would have let the two portals'
// notifications leak into each other on any browser used for both.
const STAFF_NOTIFICATIONS_KEY = "orms_staff_notifications";
const STAFF_NOTIFICATIONS_MAX = 20;

function makeNotifId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStaffNotifications() {
  let notifications;
  try {
    notifications = JSON.parse(localStorage.getItem(STAFF_NOTIFICATIONS_KEY)) || [];
  } catch {
    notifications = [];
  }
  let backfilled = false;
  notifications = notifications.map((n) => {
    if (n.id) return n;
    backfilled = true;
    return { ...n, id: makeNotifId() };
  });
  if (backfilled) localStorage.setItem(STAFF_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  return notifications;
}

function addStaffNotification(message) {
  const notifications = getStaffNotifications();
  notifications.unshift({ id: makeNotifId(), message, time: Date.now() });
  localStorage.setItem(
    STAFF_NOTIFICATIONS_KEY,
    JSON.stringify(notifications.slice(0, STAFF_NOTIFICATIONS_MAX))
  );
}

function removeStaffNotification(id) {
  const notifications = getStaffNotifications().filter((n) => n.id !== id);
  localStorage.setItem(STAFF_NOTIFICATIONS_KEY, JSON.stringify(notifications));
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

// "Seen" IDs, so polling only raises a notification for reports/concerns
// that showed up *after* this loaded — not a flood of one notification per
// already-existing submission the first time a staff member logs in.
// `null` (vs. an empty array) means "never seeded yet."
function getSeenIds(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSeenIds(key, ids) {
  localStorage.setItem(key, JSON.stringify(ids.slice(0, 200)));
}

const NOTIF_SEEN_REPORTS_KEY = "orms_staff_seen_report_ids";
const NOTIF_SEEN_CONCERNS_KEY = "orms_staff_seen_concern_ids";

// Polls GET /api/reports/staff/ and raises a notification for any report
// that wasn't there last time this ran.
async function checkForNewReports() {
  let list;
  try {
    const res = await authFetch("/api/reports/staff/");
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }

  const currentIds = list.map((r) => r.id);
  const seen = getSeenIds(NOTIF_SEEN_REPORTS_KEY);
  if (seen === null) {
    setSeenIds(NOTIF_SEEN_REPORTS_KEY, currentIds);
    return;
  }

  list
    .filter((r) => !seen.includes(r.id))
    .forEach((r) => addStaffNotification(`New report submitted by ${r.reporter}: ${r.ordinance}`));
  setSeenIds(NOTIF_SEEN_REPORTS_KEY, currentIds);
}

// Polls GET /api/concerns/staff/ and raises a notification for any concern/
// suggestion that wasn't there last time this ran.
async function checkForNewConcerns() {
  let list;
  try {
    const res = await authFetch("/api/concerns/staff/");
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }

  const currentIds = list.map((c) => c.id);
  const seen = getSeenIds(NOTIF_SEEN_CONCERNS_KEY);
  if (seen === null) {
    setSeenIds(NOTIF_SEEN_CONCERNS_KEY, currentIds);
    return;
  }

  list
    .filter((c) => !seen.includes(c.id))
    .forEach((c) => addStaffNotification(`New concern/suggestion submitted by ${c.reporter}`));
  setSeenIds(NOTIF_SEEN_CONCERNS_KEY, currentIds);
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

  // Bell icon: toggles the notifications dropdown anchored beneath it
  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifBadge = document.getElementById("notifBadge");
  const notifList = document.getElementById("notifList");

  if (notifBell && notifDropdown && notifList) {
    const renderNotifications = () => {
      const notifications = getStaffNotifications();
      notifBadge.hidden = notifications.length === 0;
      notifList.innerHTML = notifications.length
        ? notifications
            .map(
              (n) => `
              <li class="notif-dropdown__item">
                <div class="notif-dropdown__content">
                  <span class="notif-dropdown__message">${n.message}</span>
                  <span class="notif-dropdown__time">${timeAgo(n.time)}</span>
                </div>
                <button type="button" class="notif-dropdown__dismiss" data-dismiss="${n.id}" aria-label="Dismiss notification">&times;</button>
              </li>`
            )
            .join("")
        : `<li class="notif-dropdown__item">No notifications yet</li>`;
    };
    renderNotifications();

    // Dismiss (×) button on each notification — removes just that one.
    notifList.addEventListener("click", (e) => {
      const dismissBtn = e.target.closest("[data-dismiss]");
      if (!dismissBtn) return;
      e.stopPropagation();
      removeStaffNotification(dismissBtn.dataset.dismiss);
      renderNotifications();
    });

    // Check immediately on page load, then keep polling — there's no
    // real-time push here, so this is what makes new report/concern
    // submissions show up as notifications without a full page reload.
    Promise.all([checkForNewReports(), checkForNewConcerns()]).then(renderNotifications);
    setInterval(() => {
      Promise.all([checkForNewReports(), checkForNewConcerns()]).then(renderNotifications);
    }, 30000);

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
