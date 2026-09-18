// SafeSpace — File Report: populate the ordinance dropdown from the real
// uploaded ordinances, then submit the report to the real API
// (POST /api/reports/) instead of just showing a success modal with
// nothing actually saved.

document.addEventListener("DOMContentLoaded", async () => {
  // ---- Reporting As: read-only citizen info, from the session cache ----
  const reportingUser = getCurrentUser();
  if (reportingUser) {
    const nameField = document.getElementById("reporterName");
    const contactField = document.getElementById("reporterContact");
    const emailField = document.getElementById("reporterEmail");
    const addressField = document.getElementById("reporterAddress");
    if (nameField) nameField.value = reportingUser.name || "";
    if (contactField) contactField.value = reportingUser.mobile || "";
    if (emailField) emailField.value = reportingUser.email || "";
    if (addressField) addressField.value = reportingUser.address || "";
  }

  // ---- Verify It's You gate (first-ever report, or 30+ days since the last one) + cooldown ----
  const form = document.getElementById("reportForm");
  const submitBtn = form.querySelector('button[type="submit"]');
  const successModal = document.getElementById("successModal");

  const gateNotice = document.getElementById("reportGateNotice");
  const gateNoticeText = document.getElementById("reportGateNoticeText");
  const gateVerifyBtn = document.getElementById("reportGateVerifyBtn");
  const verifyModal = document.getElementById("reportVerifyModal");
  const verifyError = document.getElementById("reportVerifyError");
  const verifySendRow = document.getElementById("reportVerifySendRow");
  const verifySendBtn = document.getElementById("reportVerifySendBtn");
  const verifyCodeRow = document.getElementById("reportVerifyCodeRow");
  const verifyCodeInput = document.getElementById("reportVerifyCodeInput");
  const verifyCheckRow = document.getElementById("reportVerifyCheckRow");
  const verifyCheckBtn = document.getElementById("reportVerifyCheckBtn");
  const verifyResendBtn = document.getElementById("reportVerifyResendBtn");

  let verificationNeeded = false;
  let cooldownActive = false;

  function showVerifyError(message) {
    verifyError.textContent = message;
    verifyError.hidden = false;
  }

  function openVerifyModal() {
    verifyError.hidden = true;
    verifySendRow.hidden = false;
    verifyCodeRow.hidden = true;
    verifyCheckRow.hidden = true;
    verifyCodeInput.value = "";
    verifyModal.hidden = false;
  }

  function applyGateStatus({ verification_required, cooldown_seconds }) {
    verificationNeeded = !!verification_required;
    cooldownActive = cooldown_seconds > 0;
    if (cooldownActive) {
      const minutes = Math.max(1, Math.ceil(cooldown_seconds / 60));
      gateNoticeText.textContent = `You've recently filed a report — you can file another in about ${minutes} minute(s).`;
      gateVerifyBtn.hidden = true;
      gateNotice.hidden = false;
      submitBtn.disabled = true;
    } else if (verificationNeeded) {
      gateNoticeText.textContent = "Please verify it's you before filing this report.";
      gateVerifyBtn.hidden = false;
      gateNotice.hidden = false;
      submitBtn.disabled = true;
    } else {
      gateNotice.hidden = true;
      submitBtn.disabled = false;
    }
  }

  async function refreshGateStatus() {
    if (!isLoggedIn()) return;
    try {
      const res = await authFetch("/api/reports/verification-status/");
      if (!res.ok) return;
      applyGateStatus(await res.json());
    } catch {
      // Fail soft — the real gate check still runs again on submit.
    }
  }

  async function sendVerificationCode() {
    verifySendBtn.disabled = true;
    verifyResendBtn.disabled = true;
    verifyError.hidden = true;
    const sendingLabel = verifySendRow.hidden ? verifyResendBtn : verifySendBtn;
    const originalLabel = sendingLabel.textContent;
    sendingLabel.textContent = "Sending...";
    try {
      const res = await authFetch("/api/reports/send-verification/", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not send a verification code. Please try again.");
      }
      verifySendRow.hidden = true;
      verifyCodeRow.hidden = false;
      verifyCheckRow.hidden = false;
      verifyCodeInput.focus();
    } catch (err) {
      showVerifyError(err.message);
    } finally {
      verifySendBtn.disabled = false;
      verifyResendBtn.disabled = false;
      sendingLabel.textContent = originalLabel;
    }
  }

  gateVerifyBtn.addEventListener("click", openVerifyModal);
  verifySendBtn.addEventListener("click", sendVerificationCode);
  verifyResendBtn.addEventListener("click", sendVerificationCode);

  verifyCheckBtn.addEventListener("click", async () => {
    const code = verifyCodeInput.value.trim();
    if (!code) {
      showVerifyError("Please enter the code sent to your email.");
      return;
    }
    verifyCheckBtn.disabled = true;
    verifyCheckBtn.textContent = "Verifying...";
    verifyError.hidden = true;
    try {
      const res = await authFetch("/api/reports/verify-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const firstError = Object.values(data)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : data.detail || "Invalid or expired code.");
      }
      verifyModal.hidden = true;
      verificationNeeded = false;
      gateNotice.hidden = cooldownActive;
      submitBtn.disabled = cooldownActive;
    } catch (err) {
      showVerifyError(err.message);
    } finally {
      verifyCheckBtn.disabled = false;
      verifyCheckBtn.textContent = "Verify";
    }
  });

  if (isLoggedIn()) refreshGateStatus();

  const select = document.getElementById("ordinanceSelect");
  try {
    await ensureOrdinancesLoaded();
    select.append(...liveOrdinances().map((o) => new Option(`${o.number} — ${o.title}`, o.id)));
  } catch {
    select.append(new Option("Could not load ordinances — try reloading the page.", ""));
  }
  select.append(new Option("Other", "other"));

  // "Other" reveals a free-text field for whatever isn't in the list —
  // that text is what actually gets submitted as the ordinance, not the
  // literal word "Other" (see the submit handler below).
  const otherField = document.getElementById("otherOrdinanceField");
  const otherInput = document.getElementById("otherOrdinanceInput");
  select.addEventListener("change", () => {
    const isOther = select.value === "other";
    otherField.hidden = !isOther;
    otherInput.required = isOther;
    if (!isOther) otherInput.value = "";
  });

  // ---- Nature of Violation: TF-IDF ordinance suggestions (GET /api/ordinances/suggest/) ----
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  const violationInput = document.getElementById("violationDetails");
  const suggestionsPanel = document.getElementById("ordinanceSuggestions");
  const suggestionsList = document.getElementById("ordinanceSuggestionsList");

  function renderSuggestions(results) {
    if (!results.length) {
      suggestionsPanel.hidden = true;
      return;
    }
    suggestionsList.innerHTML = results
      .map((r) => `<li data-id="${r.id}">${r.number} — ${r.title}</li>`)
      .join("");
    suggestionsPanel.hidden = false;
  }

  const debouncedFetchSuggestions = debounce(async (text) => {
    if (text.trim().length < 3) {
      suggestionsPanel.hidden = true;
      return;
    }
    try {
      const response = await fetch(`/api/ordinances/suggest/?q=${encodeURIComponent(text.trim())}`);
      if (!response.ok) throw new Error("suggest failed");
      const { results } = await response.json();
      renderSuggestions(results || []);
    } catch {
      // Fail soft — a broken suggestion fetch must never block report submission.
      suggestionsPanel.hidden = true;
    }
  }, 400);

  violationInput.addEventListener("input", () => debouncedFetchSuggestions(violationInput.value));

  suggestionsList.addEventListener("click", (e) => {
    const item = e.target.closest("li[data-id]");
    if (!item) return;
    select.value = item.dataset.id;
    select.dispatchEvent(new Event("change"));
    suggestionsPanel.hidden = true;
  });

  // ---- Specific Location: type-to-filter street combobox ----
  const locationInput = document.getElementById("reportLocation");
  const locationList = document.getElementById("reportLocationList");

  function renderLocationOptions() {
    const query = locationInput.value.trim().toLowerCase();
    const matches = query ? STREETS.filter((s) => s.toLowerCase().includes(query)) : STREETS;
    locationList.innerHTML = matches.length
      ? matches.map((s) => `<li data-value="${s}">${s}</li>`).join("")
      : `<li class="combobox__empty">No matching street</li>`;
    locationList.hidden = false;
  }

  locationInput.addEventListener("focus", renderLocationOptions);
  locationInput.addEventListener("input", renderLocationOptions);
  locationList.addEventListener("click", (e) => {
    const option = e.target.closest("li[data-value]");
    if (!option) return;
    locationInput.value = option.dataset.value;
    locationList.hidden = true;
  });
  document.addEventListener("click", (e) => {
    if (!locationInput.contains(e.target) && !locationList.contains(e.target)) {
      locationList.hidden = true;
    }
  });
  locationInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") locationList.hidden = true;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);

    if (!isLoggedIn()) {
      showFormError(form, "Please log in to submit a report.");
      return;
    }

    if (!STREETS.includes(locationInput.value.trim())) {
      showFormError(form, "Please select a street from the list.");
      return;
    }

    const blockLot = document.getElementById("reportBlockLot").value.trim();
    if (!blockLot) {
      showFormError(form, "Please enter the Block, Lot, etc.");
      return;
    }

    if (select.value === "other" && !otherInput.value.trim()) {
      showFormError(form, "Please specify the ordinance in violation.");
      return;
    }

    const formData = new FormData();
    // Combines Block/Lot with the selected street into one location string
    // — same composition as Sign Up's address field — since Report.location
    // is a single text field, not separate columns.
    formData.append("location", `${blockLot}, ${locationInput.value.trim()}`);
    // Stores the ordinance's readable label as free text rather than its id
    // — Report.ordinance is a text snapshot, not a foreign key, so a report
    // still shows what it cited even if that ordinance is later edited or removed.
    formData.append(
      "ordinance",
      select.value === "other" ? `Other: ${otherInput.value.trim()}` : select.options[select.selectedIndex].text
    );
    formData.append("incident_date", document.getElementById("incidentDate").value);
    // Time of incident is optional — an unknown/unset time is common for
    // reports of ongoing or long-standing violations, so only send it when
    // the citizen actually picked one; an empty string would fail TimeField validation.
    const incidentTimeValue = document.getElementById("incidentTime").value;
    if (incidentTimeValue) formData.append("incident_time", incidentTimeValue);
    formData.append("nature_of_violation", document.getElementById("violationDetails").value.trim());
    Array.from(document.getElementById("reportFiles").files).forEach((file) => formData.append("files", file));

    // Belt-and-suspenders — the status check on load can go stale (e.g. the
    // page sat open past a cooldown boundary), so re-check right before
    // submitting rather than relying solely on refreshGateStatus().
    if (verificationNeeded) {
      openVerifyModal();
      showFormError(form, "Please verify it's you before filing this report.");
      return;
    }
    if (cooldownActive) {
      showFormError(form, "You're still in the cooldown period between reports.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    try {
      const response = await authFetch("/api/reports/", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.verification_required) {
          applyGateStatus({ verification_required: true, cooldown_seconds: 0 });
          openVerifyModal();
        } else if (response.status === 429) {
          refreshGateStatus();
        }
        throw new Error(data.detail || "Could not submit your report.");
      }
      successModal.hidden = false;
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      submitBtn.disabled = verificationNeeded || cooldownActive;
      submitBtn.textContent = "Submit Report";
    }
  });

  successModal.querySelectorAll("[data-modal-confirm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = "ordinances.html";
    });
  });
});
