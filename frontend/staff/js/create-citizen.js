// Barangay Platero OVRMS — Create Citizen Account (Barangay Secretary): sends a citizen an
// invite by email. The citizen adds their own name, phone, address, and password.

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("createCitizenForm");
  const email = document.getElementById("citizenInviteEmail");
  const submitBtn = document.getElementById("inviteSubmit");
  const statusEl = document.getElementById("inviteStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);
    statusEl.hidden = true;
    const address = email.value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    try {
      const response = await authFetch("/api/auth/admin/create-citizen/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data.email && data.email[0]) || data.detail || "Could not send the invite.");
      }
      statusEl.textContent = `Invite sent to ${address}. They'll get a setup code and a link by email.`;
      statusEl.hidden = false;
      form.reset();
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Invite";
    }
  });
});
