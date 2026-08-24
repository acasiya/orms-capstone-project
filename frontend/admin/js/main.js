// O.R.M.S. — shared front-end behavior, wired to the Django REST API.

// The API is served from the same host as this frontend (see
// WHITENOISE_ROOT in settings.py), so a relative path works both in local
// dev and once deployed — no hardcoded domain to update later.
const API_BASE = "/api/auth";

// JWT tokens + basic profile info are kept in localStorage so the session
// survives page navigation. The token is what actually authenticates
// requests; the cached user object is just for quick UI rendering
// (name/initials in the navbar) without a network round-trip on every page.
const AUTH_STORAGE_KEY = "orms_auth_user";
const ACCESS_TOKEN_KEY = "orms_access_token";
const REFRESH_TOKEN_KEY = "orms_refresh_token";

// Holds signup.html's fields in sessionStorage while the resident is on
// verify-signup.html choosing their ID photo, so the whole signup (text
// fields + photo) can be submitted as one multipart request from there.
const SIGNUP_DRAFT_KEY = "orms_signup_draft";

// Maps each backend role to the page it should land on after login, and to
// which portal folder that role is allowed into. Keeps the redirect logic
// in one place instead of duplicated per login form.
const ROLE_HOME = {
  citizen: "/citizen/ordinances.html",
  staff: "/staff/reports-dashboard.html",
  admin: "/admin/manage-accounts.html",
};

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

// Renders a real uploaded profile picture into an avatar container (the
// navbar icon, the profile popup avatar, etc.) when one exists, falling
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

// ---- Notifications (bell icon in the navbar) ----
// Status/remarks updates on the citizen's own reports/concerns raise a
// notification automatically (no opt-in — this is exactly what the bell
// was always supposed to be for). Stored in localStorage so a notification
// raised on one page is still there after navigating to another.
const CITIZEN_NOTIFICATIONS_KEY = "orms_citizen_notifications";
const CITIZEN_NOTIFICATIONS_MAX = 20;

function makeNotifId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCitizenNotifications() {
  let notifications;
  try {
    notifications = JSON.parse(localStorage.getItem(CITIZEN_NOTIFICATIONS_KEY)) || [];
  } catch {
    notifications = [];
  }
  let backfilled = false;
  notifications = notifications.map((n) => {
    if (n.id) return n;
    backfilled = true;
    return { ...n, id: makeNotifId() };
  });
  if (backfilled) localStorage.setItem(CITIZEN_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  return notifications;
}

function addCitizenNotification(message) {
  const notifications = getCitizenNotifications();
  notifications.unshift({ id: makeNotifId(), message, time: Date.now() });
  localStorage.setItem(
    CITIZEN_NOTIFICATIONS_KEY,
    JSON.stringify(notifications.slice(0, CITIZEN_NOTIFICATIONS_MAX))
  );
}

function removeCitizenNotification(id) {
  const notifications = getCitizenNotifications().filter((n) => n.id !== id);
  localStorage.setItem(CITIZEN_NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

function citizenTimeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const REPORT_STATUS_LABELS_FOR_NOTIF = {
  submitted: "Submitted",
  in_process: "In Process",
  resolved: "Resolved",
  with_remarks: "With Remarks",
};
const CONCERN_STATUS_LABELS_FOR_NOTIF = { submitted: "Submitted", resolved: "Resolved" };

// Snapshots each report/concern's status+remarks (keyed by id) so a later
// poll can tell whether it's actually changed since last seen. A brand-new
// item still sitting at its just-submitted default (status "submitted", no
// remarks) is baselined silently, since that's exactly the submission the
// citizen just made themselves. But an item seen for the first time in any
// other state — e.g. the citizen never had the app open between filing a
// report and staff already acting on it — is itself a change worth
// surfacing, not a silent baseline: otherwise that update would never be
// seen.
function getNotifSnapshot(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function setNotifSnapshot(key, snapshot) {
  localStorage.setItem(key, JSON.stringify(snapshot));
}

const REPORT_SNAPSHOT_KEY = "orms_citizen_report_snapshot";
const CONCERN_SNAPSHOT_KEY = "orms_citizen_concern_snapshot";

async function checkForReportUpdates() {
  let list;
  try {
    const res = await authFetch("/api/reports/");
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }

  const snapshot = getNotifSnapshot(REPORT_SNAPSHOT_KEY);
  list.forEach((r) => {
    const hash = `${r.status}|${r.remarks}`;
    const isFirstSight = !(r.id in snapshot);
    const isFreshSubmission = r.status === "submitted" && !r.remarks;
    const changed = isFirstSight ? !isFreshSubmission : snapshot[r.id] !== hash;
    if (changed) {
      const label = REPORT_STATUS_LABELS_FOR_NOTIF[r.status] || r.status;
      addCitizenNotification(`Your report "${r.ordinance}" is now ${label}.`);
    }
    snapshot[r.id] = hash;
  });
  setNotifSnapshot(REPORT_SNAPSHOT_KEY, snapshot);
}

async function checkForConcernUpdates() {
  let list;
  try {
    const res = await authFetch("/api/concerns/");
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }

  const snapshot = getNotifSnapshot(CONCERN_SNAPSHOT_KEY);
  list.forEach((c) => {
    const hash = `${c.status}|${c.remarks}`;
    const isFirstSight = !(c.id in snapshot);
    const isFreshSubmission = c.status === "submitted" && !c.remarks;
    const changed = isFirstSight ? !isFreshSubmission : snapshot[c.id] !== hash;
    if (changed) {
      const label = CONCERN_STATUS_LABELS_FOR_NOTIF[c.status] || c.status;
      addCitizenNotification(`Your concern/suggestion is now ${label}.`);
    }
    snapshot[c.id] = hash;
  });
  setNotifSnapshot(CONCERN_SNAPSHOT_KEY, snapshot);
}

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function isLoggedIn() {
  return !!getAccessToken();
}

function logOut() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Calls the real login endpoint. On success, stores the JWT tokens and a
// small user summary, and returns the user's role so the caller can decide
// where to redirect. On failure, throws with a message meant to be shown
// directly to the person (invalid credentials, network error, etc).
async function apiLogin(email, password) {
  let response;
  try {
    response = await fetch(`${API_BASE}/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    // Surfaces the backend's actual reason (e.g. "still under verification")
    // instead of a generic message, so an unverified/pending account gets a
    // meaningfully different prompt than a wrong password.
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Incorrect email or password.");
  }

  const data = await response.json();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      name: data.user.name,
      firstName: data.user.first_name,
      lastName: data.user.last_name,
      initials: data.user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      id: data.user.id,
      email: data.user.email,
      mobile: data.user.contact_number,
      address: data.user.address,
      role: data.user.role,
      position: data.user.position,
      profilePicture: data.user.profile_picture,
    })
  );
  return data.user.role;
}

// Public citizen self-registration. Takes a FormData (text fields + the
// voter_id_image file) since it's a multipart request, not JSON. Doesn't
// log the resident in — the account stays unverified until an admin
// approves it, see apiLogin's "still under verification" handling above.
async function apiRegister(formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/register/`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not create your account.");
  }

  return response.json();
}

// Attaches the stored JWT to a fetch call. Every authenticated API request
// (reports, ordinances, concerns, etc. once those endpoints exist) should
// go through this helper rather than calling fetch() directly.
async function authFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  return fetch(path, { ...options, headers });
}

// Shows an inline error message below a form's submit button (created on
// first use), for failed API calls like a wrong password.
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

// Runs on every Staff/Admin portal page except the login page itself. The
// Citizen portal deliberately allows guest browsing (viewing ordinances
// without an account, per the scope doc), so it's excluded here — the
// existing data-auth-only / data-auth-gate logic further down already
// handles hiding citizen-only actions from guests.
// Pages reachable without an active session: the login page itself, plus
// the whole "forgot password" flow (a user hitting these is by definition
// not logged in yet).
const PUBLIC_PORTAL_PAGES = [
  "index.html",
  "forgot-password.html",
  "verify-code.html",
  "reset-password.html",
  "reset-success.html",
];

function enforcePortalAccess() {
  const path = window.location.pathname;
  const isStaffOrAdmin = path.startsWith("/staff/") || path.startsWith("/admin/");
  if (!isStaffOrAdmin) return;

  const portal = path.startsWith("/staff/") ? "staff" : "admin";
  const page = path.split("/").pop();
  const isPublicPage = PUBLIC_PORTAL_PAGES.includes(page) || path === `/${portal}/`;
  if (isPublicPage) return;

  const user = getCurrentUser();
  if (!isLoggedIn() || !user || user.role !== portal) {
    window.location.href = `/${portal}/index.html`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  enforcePortalAccess();

  // Prevent full page reload on forms that don't have a real backend yet;
  // just follow the link/button's intended navigation.
  document.querySelectorAll("form[data-goto]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Some forms (e.g. Forgot Password) accept either of two fields
      // rather than requiring both, which HTML5 `required` can't express.
      if (form.dataset.requireEither) {
        const [firstName, secondName] = form.dataset.requireEither.split(",");
        const first = form.querySelector(`[name="${firstName}"]`);
        const second = form.querySelector(`[name="${secondName}"]`);
        if (!first.value.trim() && !second.value.trim()) {
          first.setCustomValidity(`Enter your ${firstName} or ${secondName}`);
          first.reportValidity();
          return;
        }
        first.setCustomValidity("");
      }

      // Sign Up step 1 (signup.html): stash the fields in sessionStorage —
      // the actual account isn't created until step 2 submits, since the
      // API needs the ID photo and the account together in one request.
      if (form.dataset.signupStep1 !== undefined) {
        const password = form.querySelector('[name="password"]');
        const confirmPassword = form.querySelector('[name="confirmPassword"]');
        clearFormError(form);
        if (password.value !== confirmPassword.value) {
          showFormError(form, "Passwords do not match.");
          return;
        }

        sessionStorage.setItem(
          SIGNUP_DRAFT_KEY,
          JSON.stringify({
            email: form.querySelector('[name="email"]').value.trim(),
            password: password.value,
            first_name: form.querySelector('[name="first_name"]').value.trim(),
            last_name: form.querySelector('[name="last_name"]').value.trim(),
            contact_number: form.querySelector('[name="phone"]').value.trim(),
            address: form.querySelector('[name="address"]').value.trim(),
          })
        );
        window.location.href = form.dataset.goto;
        return;
      }

      // Sign Up step 2 (verify-signup.html): combines step 1's stashed
      // fields with the ID photo and actually creates the account.
      if (form.dataset.signupStep2 !== undefined) {
        const submitBtn = form.querySelector('button[type="submit"]');
        const fileInput = form.querySelector('[name="idPhoto"]');
        clearFormError(form);

        let draft = null;
        try {
          draft = JSON.parse(sessionStorage.getItem(SIGNUP_DRAFT_KEY));
        } catch {
          draft = null;
        }
        if (!draft) {
          window.location.href = "signup.html";
          return;
        }
        if (!fileInput.files.length) {
          showFormError(form, "Please upload a photo of your Barangay ID.");
          return;
        }

        const formData = new FormData();
        Object.entries(draft).forEach(([key, value]) => formData.append(key, value));
        formData.append("voter_id_image", fileInput.files[0]);

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
        try {
          await apiRegister(formData);
          sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
          window.location.href = form.dataset.goto;
        } catch (err) {
          showFormError(form, err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit";
        }
        return;
      }

      // The login form hits the real API instead of just navigating.
      // (Note: "Email or Phone" field currently requires an email — phone
      // login isn't implemented on the backend yet.)
      if (form.dataset.login !== undefined) {
        const submitBtn = form.querySelector('button[type="submit"]');
        const emailField = form.querySelector('[name="emailOrPhone"]');
        const passwordField = form.querySelector('[name="password"]');
        clearFormError(form);

        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";
        try {
          const role = await apiLogin(emailField.value.trim(), passwordField.value);
          window.location.href = ROLE_HOME[role] || form.dataset.goto;
        } catch (err) {
          showFormError(form, err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = "Login Now";
        }
        return;
      }

      window.location.href = form.dataset.goto;
    });
  });

  // Confirm-password validation
  const pw = document.querySelector('[name="password"]');
  const confirmPw = document.querySelector('[name="confirmPassword"]');
  if (pw && confirmPw) {
    const validate = () => {
      confirmPw.setCustomValidity(
        confirmPw.value && confirmPw.value !== pw.value ? "Passwords do not match" : ""
      );
    };
    pw.addEventListener("input", validate);
    confirmPw.addEventListener("input", validate);
  }

  // Numeric-only, auto-advancing feel for one-time-code fields
  document.querySelectorAll('[name="code"]').forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 6);
    });
  });

  // Footer (info section) only fades into view once scrolled into the viewport
  const infoSection = document.querySelector(".info-section");
  if (infoSection) {
    const revealOnScroll = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealOnScroll.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealOnScroll.observe(infoSection);
  }

  // Barangay ID upload preview (Sign Up verification step)
  const idInput = document.getElementById("idPhoto");
  if (idInput) {
    const preview = document.getElementById("idPreview");
    idInput.addEventListener("change", () => {
      const file = idInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.hidden = false;
      };
      reader.readAsDataURL(file);
    });
    if (idInput.form) {
      idInput.form.addEventListener("reset", () => {
        preview.hidden = true;
      });
    }
  }

  // Generic dropzone label text + drag-and-drop: shows the selected
  // filename(s), restores the placeholder copy on form reset, and actually
  // implements the "drag & drop" the dropzone copy invites (browsers don't
  // populate a hidden file input from a drop event on their own). Covers
  // Barangay ID, report, and suggestion uploads.
  //
  // Selects the LABEL first, then resolves its input via `.control` —
  // these labels reference their input through for="…"/id="…" as siblings,
  // not by wrapping it, so a selector like `.upload-drop input` (requiring
  // the input to be a descendant) would never match anything here.
  document.querySelectorAll("label.upload-drop").forEach((label) => {
    const input = label.control;
    if (!input || input.type !== "file") return;
    const textEl = label.querySelector(".upload-drop__text");
    if (!textEl) return;
    const defaultText = textEl.textContent;
    input.addEventListener("change", () => {
      const files = Array.from(input.files);
      textEl.textContent = !files.length
        ? defaultText
        : files.length === 1
          ? files[0].name
          : `${files.length} files selected`;
    });
    if (input.form) {
      input.form.addEventListener("reset", () => {
        textEl.textContent = defaultText;
      });
    }

    ["dragenter", "dragover"].forEach((evt) => {
      label.addEventListener(evt, (e) => {
        e.preventDefault();
        label.classList.add("upload-drop--dragover");
      });
    });
    ["dragleave", "dragend", "drop"].forEach((evt) => {
      label.addEventListener(evt, (e) => {
        e.preventDefault();
        label.classList.remove("upload-drop--dragover");
      });
    });
    label.addEventListener("drop", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Forms that submit into a confirmation modal instead of a full page nav,
  // then redirect once the user confirms (File Report, Submit Suggestion).
  document.querySelectorAll("form[data-success-modal]").forEach((form) => {
    const modal = document.getElementById(form.dataset.successModal);
    if (!modal) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      modal.hidden = false;
    });
    modal.querySelectorAll("[data-modal-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = form.dataset.redirect || "index.html";
      });
    });
  });

  // ---- Mobile nav (hamburger) ----
  // Injected via JS rather than duplicated into every page's navbar markup
  // (same approach as the admin sidebar's mobile backdrop). Below ~860px,
  // style.css hides .navbar__links by default and only shows it with
  // .is-open — this button is what toggles that.
  const navLinks = document.querySelector(".navbar__links");
  const navBrand = document.querySelector(".navbar__brand");
  if (navLinks && navBrand) {
    const navHamburger = document.createElement("button");
    navHamburger.type = "button";
    navHamburger.className = "navbar__hamburger";
    navHamburger.setAttribute("aria-label", "Toggle menu");
    navHamburger.setAttribute("aria-expanded", "false");
    navHamburger.innerHTML = "&#9776;";
    navBrand.insertAdjacentElement("afterend", navHamburger);

    const closeNavMenu = () => {
      navLinks.classList.remove("is-open");
      navHamburger.setAttribute("aria-expanded", "false");
    };

    navHamburger.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("is-open");
      navHamburger.setAttribute("aria-expanded", String(isOpen));
    });

    // A tapped link (or an auth-gate link that opens a modal instead of
    // navigating) should close the menu rather than leave it open over
    // whatever comes next.
    navLinks.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeNavMenu();
    });

    // Rotating a tablet/resizing past the mobile breakpoint while the menu
    // is open would otherwise leave it stuck open once desktop styles
    // (where .navbar__links is always visible) no longer apply .is-open.
    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) closeNavMenu();
    });
  }

  // ---- Auth-aware nav + account popups ----
  const loggedIn = isLoggedIn();
  const user = getCurrentUser();

  // Bell + My Reports + My Concerns/Suggestions only show while logged in
  document.querySelectorAll("[data-auth-only]").forEach((el) => {
    el.hidden = !loggedIn;
  });

  // File Report / Submit Suggestion nav links: guests get a sign-up/login
  // prompt instead of the form.
  const authGateModal = document.getElementById("authGateModal");
  const authGateTitle = document.getElementById("authGateTitle");
  if (authGateModal && authGateTitle) {
    document.querySelectorAll("[data-auth-gate]").forEach((link) => {
      link.addEventListener("click", (e) => {
        if (loggedIn) return;
        e.preventDefault();
        authGateTitle.textContent =
          link.dataset.authGate === "report"
            ? "Want to Submit a Report?"
            : "Want to be Submit a Concern/Suggestion?";
        authGateModal.hidden = false;
      });
    });
  }

  // Profile icon: Guest Account card, or the logged-in account card
  const profileBtn = document.querySelector(".navbar__profile");
  const profileModal = document.getElementById("profileModal");
  const profileGuestView = document.getElementById("profileGuestView");
  const profileUserView = document.getElementById("profileUserView");
  if (profileBtn && profileModal) {
    if (loggedIn && user) renderAvatar(profileBtn, user);

    const openProfileModal = () => {
      if (loggedIn && user) {
        profileGuestView.hidden = true;
        profileUserView.hidden = false;
        document.getElementById("profileUserName").textContent = user.name;
        renderAvatar(document.getElementById("profileUserInitials"), user);
      } else {
        profileGuestView.hidden = false;
        profileUserView.hidden = true;
      }
      profileModal.hidden = false;
    };
    profileBtn.addEventListener("click", openProfileModal);
    profileBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProfileModal();
      }
    });
  }

  // Log Out -> confirmation popup -> clears auth and returns to login
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutConfirmModal = document.getElementById("logoutConfirmModal");
  if (logoutBtn && logoutConfirmModal) {
    logoutBtn.addEventListener("click", () => {
      profileModal.hidden = true;
      logoutConfirmModal.hidden = false;
    });
  }
  const logoutYes = document.getElementById("logoutYes");
  const logoutNo = document.getElementById("logoutNo");
  if (logoutYes) {
    logoutYes.addEventListener("click", async () => {
      // Closes out the LoginSession for View Audit Logs — best-effort, since
      // the local session should clear either way. Must happen before
      // logOut() removes the token authFetch needs to authenticate this.
      try {
        await authFetch("/api/auth/logout/", { method: "POST" });
      } catch {
        // ignore — logging out locally still proceeds below
      }
      logOut();
      window.location.href = "index.html";
    });
  }
  if (logoutNo) {
    logoutNo.addEventListener("click", () => {
      logoutConfirmModal.hidden = true;
    });
  }

  // Bell icon: toggles the notifications dropdown anchored beneath it, and
  // (while logged in) polls for real status updates on the citizen's own
  // reports/concerns to populate it.
  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifBadge = document.getElementById("notifBadge");
  const notifList = document.getElementById("notifList");

  if (notifBell && notifDropdown && notifList) {
    const renderNotifications = () => {
      const notifications = getCitizenNotifications();
      if (notifBadge) notifBadge.hidden = notifications.length === 0;
      notifList.innerHTML = notifications.length
        ? notifications
            .map(
              (n) => `
              <li class="notif-dropdown__item">
                <div class="notif-dropdown__content">
                  <span class="notif-dropdown__message">${n.message}</span>
                  <span class="notif-dropdown__time">${citizenTimeAgo(n.time)}</span>
                </div>
                <button type="button" class="notif-dropdown__dismiss" data-dismiss="${n.id}" aria-label="Dismiss notification">&times;</button>
              </li>`
            )
            .join("")
        : `<li class="notif-dropdown__item">No notifications yet</li>`;
    };
    renderNotifications();

    notifList.addEventListener("click", (e) => {
      const dismissBtn = e.target.closest("[data-dismiss]");
      if (!dismissBtn) return;
      e.stopPropagation();
      removeCitizenNotification(dismissBtn.dataset.dismiss);
      renderNotifications();
    });

    if (loggedIn) {
      Promise.all([checkForReportUpdates(), checkForConcernUpdates()]).then(renderNotifications);
      setInterval(() => {
        Promise.all([checkForReportUpdates(), checkForConcernUpdates()]).then(renderNotifications);
      }, 30000);
    }

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

  // Dismiss: explicit close buttons, or clicking the dimmed backdrop
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-overlay").hidden = true;
    });
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
});
