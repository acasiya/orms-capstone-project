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

  const form = document.getElementById("reportForm");
  const submitBtn = form.querySelector('button[type="submit"]');
  const successModal = document.getElementById("successModal");

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

    if (select.value === "other" && !otherInput.value.trim()) {
      showFormError(form, "Please specify the ordinance in violation.");
      return;
    }

    const formData = new FormData();
    formData.append("location", document.getElementById("reportLocation").value.trim());
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

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    try {
      const response = await authFetch("/api/reports/", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const firstError = Object.values(data)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not submit your report.");
      }
      successModal.hidden = false;
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report";
    }
  });

  successModal.querySelectorAll("[data-modal-confirm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = "ordinances.html";
    });
  });
});
