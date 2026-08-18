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
    throw new Error("Incorrect email or password.");
  }

  const data = await response.json();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      name: data.user.name,
      initials: data.user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      email: data.user.email,
      mobile: data.user.contact_number,
      address: data.user.address,
      role: data.user.role,
    })
  );
  return data.user.role;
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
function enforcePortalAccess() {
  const path = window.location.pathname;
  const isStaffOrAdmin = path.startsWith("/staff/") || path.startsWith("/admin/");
  if (!isStaffOrAdmin) return;

  const portal = path.startsWith("/staff/") ? "staff" : "admin";
  const isLoginPage = path.endsWith("/index.html") || path === `/${portal}/`;
  if (isLoginPage) return;

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

  // Generic dropzone label text: shows the selected filename(s), restores
  // the placeholder copy on form reset. Covers Barangay ID, report, and
  // suggestion uploads.
  document.querySelectorAll('.upload-drop input[type="file"]').forEach((input) => {
    const label = document.querySelector(`label[for="${input.id}"]`);
    const textEl = label ? label.querySelector(".upload-drop__text") : null;
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
    const openProfileModal = () => {
      if (loggedIn && user) {
        profileGuestView.hidden = true;
        profileUserView.hidden = false;
        document.getElementById("profileUserName").textContent = user.name;
        document.getElementById("profileUserInitials").textContent = user.initials;
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
    logoutYes.addEventListener("click", () => {
      logOut();
      window.location.href = "index.html";
    });
  }
  if (logoutNo) {
    logoutNo.addEventListener("click", () => {
      logoutConfirmModal.hidden = true;
    });
  }

  // Bell icon: toggles the notifications dropdown anchored beneath it
  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  if (notifBell && notifDropdown) {
    const toggleNotifDropdown = () => {
      notifDropdown.hidden = !notifDropdown.hidden;
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
