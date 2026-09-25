// SafeSpace — site footer (About Us, Privacy Policy, Terms and Agreements).
// Renders into <footer id="siteFooter"> and fills any [data-barangay="..."]
// element on the page (About Us' contact card) from BARANGAY_INFO, so the
// barangay's contact details live in exactly one place.
//
// Load this BEFORE main.js: the footer's File Report / Submit Suggestion
// links carry data-auth-gate, which main.js wires up on load.

// `address` is a Google Maps Plus Code for the Barangay Hall. Leave
// officeHours empty until the Barangay confirms them — the footer skips it.
const BARANGAY_INFO = {
  name: "Barangay Platero",
  city: "City of Biñan, Laguna",
  address: "83CV+X8P, Platero, Biñan, Laguna",
  phone: "0995 167 1070",
  email: "brgy.platero0@gmail.com",
  officeHours: "",
  emergency: "911",
};

const BARANGAY_PHONE_HREF = `tel:+63${BARANGAY_INFO.phone.replace(/\D/g, "").replace(/^0/, "")}`;
const BARANGAY_MAP_HREF = `https://maps.google.com/?q=${encodeURIComponent(BARANGAY_INFO.address)}`;

(function renderSiteFooter() {
  const footer = document.getElementById("siteFooter");

  // Filled as links where it helps: tap-to-call, tap-to-email, open in Maps.
  const LINKS = {
    phone: BARANGAY_PHONE_HREF,
    email: `mailto:${BARANGAY_INFO.email}`,
    address: BARANGAY_MAP_HREF,
  };
  document.querySelectorAll("[data-barangay]").forEach((el) => {
    const key = el.dataset.barangay;
    const value = BARANGAY_INFO[key];
    if (!value) return;
    if (LINKS[key] && el.hasAttribute("data-barangay-link")) {
      const a = document.createElement("a");
      a.href = LINKS[key];
      a.textContent = value;
      if (key === "address") {
        a.target = "_blank";
        a.rel = "noopener";
      }
      el.replaceChildren(a);
    } else {
      el.textContent = value;
    }
  });

  if (!footer) return;
  const year = new Date().getFullYear();
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="site-footer__inner">
      <div class="site-footer__brand">
        <img src="drawables/logo-barangay-platero.png" alt="Barangay Platero seal" width="64" height="64" />
        <div>
          <p class="site-footer__name">${BARANGAY_INFO.name}</p>
          <p class="site-footer__sub">${BARANGAY_INFO.city}</p>
          <p class="site-footer__tagline">SafeSpace — Online Reporting and Management System</p>
        </div>
      </div>

      <nav class="site-footer__col" aria-label="Quick links">
        <h2 class="site-footer__heading">Quick Links</h2>
        <ul>
          <li><a href="ordinances.html">Ordinances</a></li>
          <li><a href="file-report.html" data-auth-gate="report">File a Report</a></li>
          <li><a href="submit-suggestion.html" data-auth-gate="suggestion">Submit a Suggestion</a></li>
          <li><a href="faqs.html">FAQs</a></li>
          <li><a href="about.html">About Us</a></li>
        </ul>
      </nav>

      <nav class="site-footer__col" aria-label="Legal">
        <h2 class="site-footer__heading">Legal</h2>
        <ul>
          <li><a href="privacy-policy.html">Privacy Policy</a></li>
          <li><a href="terms.html">Terms and Agreements</a></li>
          <li><a href="privacy-policy.html#your-rights">Your Data Privacy Rights</a></li>
        </ul>
      </nav>

      <div class="site-footer__col">
        <h2 class="site-footer__heading">Contact Us</h2>
        <ul class="site-footer__contact">
          <li><a href="${BARANGAY_MAP_HREF}" target="_blank" rel="noopener">${BARANGAY_INFO.address}</a></li>
          <li><a href="${BARANGAY_PHONE_HREF}">${BARANGAY_INFO.phone}</a></li>
          <li><a href="mailto:${BARANGAY_INFO.email}">${BARANGAY_INFO.email}</a></li>
          ${BARANGAY_INFO.officeHours ? `<li>${BARANGAY_INFO.officeHours}</li>` : ""}
        </ul>
        <p class="site-footer__emergency">Emergency? Call <a href="tel:${BARANGAY_INFO.emergency}">${BARANGAY_INFO.emergency}</a>. SafeSpace is not an emergency service.</p>
      </div>
    </div>

    <div class="site-footer__bottom">
      <p>&copy; ${year} ${BARANGAY_INFO.name}, ${BARANGAY_INFO.city}. All rights reserved.</p>
      <p>Personal data is processed under the Data Privacy Act of 2012 (Republic Act No. 10173).</p>
    </div>`;
})();
