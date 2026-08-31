// SafeSpace — My Concern/Suggestion detail: fetch the real concern by the ?id= query param.

const CONCERN_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

// Opens the clicked thumbnail full-size in an overlay on this same page,
// instead of navigating to it in a new tab.
function openMediaLightbox(url, isVideo) {
  const lightbox = document.getElementById("mediaLightbox");
  const body = document.getElementById("mediaLightboxBody");
  if (!lightbox || !body) return;
  body.innerHTML = isVideo
    ? `<video src="${url}" controls autoplay></video>`
    : `<img src="${url}" alt="Uploaded evidence" />`;
  lightbox.hidden = false;
}

// Renders the real uploaded files (photos/videos) into `container`, or
// falls back to a plain "No uploaded evidence" notice when nothing was
// attached. Same idea as my-report-detail.js's renderEvidence — kept as
// its own small copy here since these two pages don't load each other's JS.
function renderConcernEvidence(container, urls) {
  if (!urls || !urls.length) {
    container.innerHTML = `<div class="evidence-photo">No uploaded evidence</div>`;
    return;
  }
  container.className = "evidence-photo-grid";
  container.innerHTML = urls
    .map((url) => {
      const isVideo = CONCERN_VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
      const media = isVideo
        ? `<video src="${url}" muted></video>`
        : `<img src="${url}" alt="Uploaded evidence" />`;
      return `<button type="button" class="evidence-photo-grid__item" data-lightbox-url="${url}" data-lightbox-video="${isVideo}">${media}</button>`;
    })
    .join("");
  container.querySelectorAll("[data-lightbox-url]").forEach((btn) => {
    btn.addEventListener("click", () => openMediaLightbox(btn.dataset.lightboxUrl, btn.dataset.lightboxVideo === "true"));
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  let concern = null;
  try {
    concern = id ? await getConcernById(id) : null;
  } catch {
    concern = null;
  }

  if (!concern) {
    document.querySelector(".concern-detail__main").innerHTML =
      "<p>Suggestion/Concern not found.</p>";
    return;
  }

  document.title = "Concern/Suggestion — SafeSpace";
  document.getElementById("concernLocation").value = concern.location;
  document.getElementById("concernDescription").value = concern.description;
  renderConcernEvidence(document.getElementById("concernEvidence"), concern.attachments);
  document.getElementById("timelineDateTime").textContent = new Date(concern.created_at).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
});
