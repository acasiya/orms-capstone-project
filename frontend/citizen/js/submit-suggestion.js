// O.R.M.S. — Submit Suggestion: submits the concern/suggestion to the real
// API (POST /api/concerns/) instead of just showing a success modal with
// nothing actually saved.

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("suggestionForm");
  const submitBtn = form.querySelector('button[type="submit"]');
  const successModal = document.getElementById("successModal");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);

    if (!isLoggedIn()) {
      showFormError(form, "Please log in to submit a concern/suggestion.");
      return;
    }

    const formData = new FormData();
    formData.append("location", document.getElementById("suggestionLocation").value.trim());
    formData.append("description", document.getElementById("suggestionDetails").value.trim());
    Array.from(document.getElementById("suggestionFiles").files).forEach((file) => formData.append("files", file));

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    try {
      const response = await authFetch("/api/concerns/", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const firstError = Object.values(data)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not submit your concern/suggestion.");
      }
      successModal.hidden = false;
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Suggestion";
    }
  });

  successModal.querySelectorAll("[data-modal-confirm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = "ordinances.html";
    });
  });
});
