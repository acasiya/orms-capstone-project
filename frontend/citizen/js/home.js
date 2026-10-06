// SafeSpace — Home page: announcements as news cards (full text in a popup,
// with per-citizen unread banners), Latest Ordinances (unread for logged-in
// citizens, the most recent for guests), and notifications (logged-in only).

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

const NEWS_EXCERPT_LENGTH = 180;

let _announcements = [];

async function loadAnnouncements(loggedIn) {
  const response = loggedIn
    ? await authFetch("/api/announcements/")
    : await fetch("/api/announcements/");
  if (!response.ok) throw new Error("Could not load announcements.");
  return response.json();
}

function formatNewsDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const TAG_WINDOW_DAYS = 30;

// "Updated" if it was edited within the last month, otherwise "New" if it was
// uploaded within the last month. Ordinances older than that get no tag.
function tagFor(o) {
  const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
  const edited = new Date(o.updated_at) - new Date(o.created_at) > 60 * 1000;
  if (edited && daysSince(o.updated_at) < TAG_WINDOW_DAYS) {
    return '<span class="latest-ord-card__new latest-ord-card__new--updated">Updated</span>';
  }
  if (daysSince(o.created_at) < TAG_WINDOW_DAYS) {
    return '<span class="latest-ord-card__new">New</span>';
  }
  return "";
}

function excerptOrdinance(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 140).trimEnd()}…` : flat;
}

function excerpt(text) {
  return text.length > NEWS_EXCERPT_LENGTH ? `${text.slice(0, NEWS_EXCERPT_LENGTH).trimEnd()}…` : text;
}

function isUnread(announcement, loggedIn) {
  return loggedIn && !announcement.is_read;
}

function renderNewsGrid(container, announcements, loggedIn) {
  if (!announcements.length) {
    container.innerHTML = `<div class="ordinances-empty">No announcements yet.</div>`;
    return;
  }
  container.innerHTML = announcements
    .map((a) => {
      const unread = isUnread(a, loggedIn);
      return `
      <article class="news-card${unread ? " news-card--unread" : ""}" data-announcement-id="${a.id}">
        ${a.image_url ? `<img class="news-card__image" src="${escapeHtml(a.image_url)}" alt="" />` : `<div class="news-card__image news-card__image--empty" aria-hidden="true"></div>`}
        <div class="news-card__body">
          ${unread ? `<span class="news-card__banner">New</span>` : ""}
          <h2 class="news-card__title">${escapeHtml(a.title)}</h2>
          <p class="news-card__excerpt">${escapeHtml(excerpt(a.description))}</p>
          <div class="news-card__footer">
            <span class="news-card__date">${formatNewsDate(a.created_at)}</span>
            <button type="button" class="news-card__more" data-read-more="${a.id}">Read more</button>
          </div>
        </div>
      </article>`;
    })
    .join("");

  container.querySelectorAll("[data-read-more]").forEach((btn) => {
    btn.addEventListener("click", () => openAnnouncement(btn.dataset.readMore, container));
  });
}

function openAnnouncement(id, grid) {
  const a = _announcements.find((item) => item.id === id);
  if (!a) return;
  const modal = document.getElementById("announcementModal");
  document.getElementById("announcementModalBody").innerHTML = `
    ${a.image_url ? `<img class="news-modal__image" src="${escapeHtml(a.image_url)}" alt="" />` : ""}
    <h2 class="news-modal__title">${escapeHtml(a.title)}</h2>
    <p class="news-modal__meta">${formatNewsDate(a.created_at)}${a.posted_by_name ? ` &middot; Posted by ${escapeHtml(a.posted_by_name)}` : ""}</p>
    <p class="news-modal__description">${escapeHtml(a.description)}</p>`;
  modal.hidden = false;

  // Reading an announcement is what "viewing" it means: its banner goes away
  // on screen and server-side.
  if (isUnread(a, isLoggedIn())) {
    a.is_read = true;
    const card = grid.querySelector(`[data-announcement-id="${id}"]`);
    if (card) {
      card.classList.remove("news-card--unread");
      const banner = card.querySelector(".news-card__banner");
      if (banner) banner.remove();
    }
    authFetch(`/api/announcements/${encodeURIComponent(id)}/view/`, { method: "POST" }).catch(() => {});
  }
}

function renderNotificationsSection(section, container) {
  const notifications = getCitizenNotifications();
  section.hidden = false;
  if (!notifications.length) {
    container.innerHTML = `<div class="ordinances-empty">No notifications yet.</div>`;
    return;
  }
  container.innerHTML = `
    <div class="home-notifications__toolbar">
      <button type="button" class="home-notifications__clear" id="homeNotifClearAll">Clear all</button>
    </div>
    <ul class="home-notifications">${notifications
      .map(
        (n) => `
      <li class="home-notifications__item">
        ${n.link ? `<a href="${escapeHtml(n.link)}" data-home-notif="${n.id}">${n.message}</a>` : `<span>${n.message}</span>`}
        <span class="home-notifications__time">${citizenTimeAgo(n.time)}</span>
        <button type="button" class="home-notifications__dismiss" data-home-dismiss="${n.id}" aria-label="Dismiss notification">&times;</button>
      </li>`
      )
      .join("")}</ul>`;

  container.querySelector("#homeNotifClearAll").addEventListener("click", () => {
    clearAllCitizenNotifications();
    renderNotificationsSection(section, container);
  });
  container.querySelectorAll("[data-home-dismiss]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeCitizenNotification(btn.dataset.homeDismiss);
      renderNotificationsSection(section, container);
    });
  });
  container.querySelectorAll("[data-home-notif]").forEach((link) => {
    link.addEventListener("click", () => removeCitizenNotification(link.dataset.homeNotif));
  });
}

async function renderLatestOrdinances(container, loggedIn) {
  const response = loggedIn ? await authFetch("/api/ordinances/") : await fetch("/api/ordinances/");
  if (!response.ok) throw new Error("Could not load ordinances.");
  const all = await response.json();

  // Logged-in citizens get the ordinances they haven't opened yet; guests get all
  // of them. Newest first by date approved, like the Ordinances page.
  const rows = all
    .filter((o) => !loggedIn || o.is_unread)
    .slice()
    .sort((a, b) => b.date_approved.localeCompare(a.date_approved));

  container.innerHTML = rows.length
    ? `<div class="latest-ord-list">${rows
        .map(
          (o) => `
        <a class="latest-ord-card" href="ordinance-detail.html?id=${encodeURIComponent(o.id)}">
          ${tagFor(o)}
          <span class="latest-ord-card__title">${escapeHtml(o.title)}</span>
          <span class="latest-ord-card__desc">${escapeHtml(excerptOrdinance(o.description))}</span>
        </a>`
        )
        .join("")}</div>`
    : `<div class="ordinances-empty">${loggedIn ? "You're all caught up — no unread ordinances." : "No ordinances have been posted yet."}</div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const loggedIn = isLoggedIn();

  const newsGrid = document.getElementById("announcementList");
  try {
    _announcements = await loadAnnouncements(loggedIn);
    renderNewsGrid(newsGrid, _announcements, loggedIn);
  } catch (err) {
    newsGrid.innerHTML = `<div class="ordinances-empty">${escapeHtml(err.message)}</div>`;
  }

  const modal = document.getElementById("announcementModal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  try {
    await renderLatestOrdinances(document.getElementById("latestOrdinancesBody"), loggedIn);
  } catch (err) {
    document.getElementById("latestOrdinancesBody").innerHTML = `<div class="ordinances-empty">${escapeHtml(err.message)}</div>`;
  }

  if (loggedIn) {
    renderNotificationsSection(
      document.getElementById("notificationsSection"),
      document.getElementById("notificationsBody")
    );
  }
});
