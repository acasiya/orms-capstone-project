// SafeSpace — File Report: populate the ordinance dropdown from the real
// uploaded ordinances, then submit the report to the real API
// (POST /api/reports/) instead of just showing a success modal with
// nothing actually saved.

document.addEventListener("DOMContentLoaded", async () => {
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
    formData.append("incident_time", document.getElementById("incidentTime").value);
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
