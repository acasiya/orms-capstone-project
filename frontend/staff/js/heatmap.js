// O.R.M.S. — shared incident heatmap for the staff dashboards.
//
// Renders a real Leaflet + OpenStreetMap map with a heat layer whose
// intensity is the number of reports (or concerns) per street. Incident
// points are the street centroids in street-coordinates.js — the citizen
// only picks a street name when filing, never a precise pin, so this is a
// street-level density map, not exact incident locations.
//
// Depends (load order): vendor/leaflet/leaflet.js, vendor/leaflet/leaflet-heat.js,
// js/street-coordinates.js — then this file.

const HEATMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const HEATMAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Barangay Platero / Villaggio di Xavier area. The small dashboard card
// always uses this fixed framing (a 260px card can't usefully auto-fit a
// spread of incidents); the enlarged modal fits to the actual data.
const HEATMAP_CARD_CENTER = [14.3175, 121.0905];
const HEATMAP_CARD_ZOOM = 14;
// Where the modal centers before its first fitBounds, and where either map
// sits when a period has no incidents at all.
const HEATMAP_FALLBACK_CENTER = [14.3175, 121.0905];
const HEATMAP_FALLBACK_ZOOM = 14;

// Heat gradient aligned with the Low / Moderate / High / Critical legend.
const HEATMAP_GRADIENT = { 0.0: "#4caf50", 0.35: "#f2c94c", 0.65: "#f2994a", 1.0: "#e63946" };

// Point Leaflet's default marker assets at the vendored copies (only matters
// if a plain marker is ever added, but sets the expectation up front).
if (window.L && L.Icon && L.Icon.Default) {
  L.Icon.Default.imagePath = "vendor/leaflet/images/";
}

// Tallies reports/concerns by their `location` string for the given list.
// Returns { "Ferrari Street": 3, ... }.
function countByLocation(items) {
  const counts = {};
  items.forEach((it) => {
    const name = (it.location || "").trim();
    if (!name) return;
    counts[name] = (counts[name] || 0) + 1;
  });
  return counts;
}

// Creates a heatmap bound to `el` (a .heatmap-canvas div). Returns a small
// handle: { render(counts), invalidate(), map }.
//
// opts.interactive === false (default for the small dashboard card) gives a
// static map — no drag/zoom/scroll — so the card as a whole stays a
// click-to-enlarge target. The enlarged modal map passes interactive: true.
function createIncidentHeatmap(el, opts = {}) {
  const interactive = opts.interactive === true;
  const emptyMessage = opts.emptyMessage || "No incidents in this period";

  const map = L.map(el, {
    zoomControl: interactive,
    scrollWheelZoom: interactive,
    dragging: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    touchZoom: interactive,
    tap: false,
  });
  map.attributionControl.setPrefix("");

  L.tileLayer(HEATMAP_TILE_URL, {
    maxZoom: 19,
    attribution: HEATMAP_TILE_ATTRIBUTION,
  }).addTo(map);

  map.setView(HEATMAP_FALLBACK_CENTER, HEATMAP_FALLBACK_ZOOM);

  let heatLayer = null;
  let fittedOnce = false;
  let lastBounds = null;

  function setOverlay(message) {
    let overlay = el.querySelector(".heatmap-canvas__empty");
    if (message) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "heatmap-canvas__empty";
        el.appendChild(overlay);
      }
      overlay.textContent = message;
    } else if (overlay) {
      overlay.remove();
    }
  }

  // counts: { streetName: incidentCount }. Unknown street names (not in
  // street-coordinates.js) are returned so the caller can surface them.
  function render(counts) {
    const points = [];
    const unmapped = [];
    let max = 0;

    Object.entries(counts).forEach(([name, count]) => {
      if (!count) return;
      const coord = STREET_COORDINATES[name];
      if (!coord) {
        unmapped.push(name);
        return;
      }
      points.push([coord[0], coord[1], count]);
      if (count > max) max = count;
    });

    if (heatLayer) {
      heatLayer.remove();
      heatLayer = null;
    }

    if (!points.length) {
      setOverlay(emptyMessage);
      lastBounds = null;
      return unmapped;
    }
    setOverlay(null);
    lastBounds = L.latLngBounds(points.map((p) => [p[0], p[1]])).pad(0.25);

    heatLayer = L.heatLayer(points, {
      radius: interactive ? 45 : 30,
      blur: interactive ? 28 : 20,
      minOpacity: 0.45,
      // Intensity saturates at neighborhood zoom rather than street zoom, so
      // the blobs stay readable when the map is fitted to the whole barangay.
      maxZoom: 15,
      // Floor the top-of-gradient count so a light week (max 1-2 reports on a
      // street) still shows warm colour instead of faint green everywhere.
      max: Math.max(4, max),
      gradient: HEATMAP_GRADIENT,
    }).addTo(map);

    // The static card has no pan/zoom to preserve, so always reframe it to
    // the current period. The interactive modal is reframed only on open
    // (see openHeatmapModal) so a staffer's manual pan/zoom survives a
    // period change.
    if (!interactive || !fittedOnce) {
      fit();
      fittedOnce = true;
    }
    return unmapped;
  }

  // Frame the current incident spread. The card keeps its fixed framing
  // (see HEATMAP_CARD_*); only the interactive modal fits to the data, and
  // only when called after its container is visible (fitBounds needs real
  // container dimensions).
  function fit() {
    if (!interactive) {
      map.setView(HEATMAP_CARD_CENTER, HEATMAP_CARD_ZOOM, { animate: false });
      return;
    }
    if (lastBounds && lastBounds.isValid()) {
      map.fitBounds(lastBounds, { maxZoom: 16, animate: false });
    }
  }

  function invalidate() {
    map.invalidateSize();
  }

  return { map, render, invalidate, fit };
}
