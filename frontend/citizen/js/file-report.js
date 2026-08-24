// O.R.M.S. — File Report: populate the ordinance dropdown from the real
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

    const formData = new FormData();
    formData.append("location", document.getElementById("reportLocation").value.trim());
    // Stores the ordinance's readable label as free text rather than its id
    // — Report.ordinance is a text snapshot, not a foreign key, so a report
    // still shows what it cited even if that ordinance is later edited or removed.
    formData.append("ordinance", select.options[select.selectedIndex].text);
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
