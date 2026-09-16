// SafeSpace — shared incident heatmap for the staff dashboards.
//
// Renders a real Leaflet + OpenStreetMap map with a heat layer whose
// intensity is the number of reports (or concerns) per street. Incident
// points are the street centroids in street-coordinates.js — the citizen
// only picks a street name when filing, never a precise pin, so this is a
// street-level density map, not exact incident locations.
//
// Depends (load order): vendor/leaflet/leaflet.js, vendor/leaflet/leaflet-heat.js,
// js/street-coordinates.js — then this file.

// tile.openstreetmap.org is OSM's own demo server, meant for light,
// occasional use — it actively rate-limits/blocks any third-party app that
// hits it repeatedly (that's what was happening: every tile came back as
// OSM's "Access blocked" 403 image instead of an actual map). CARTO's
// basemaps.cartocdn.com looked like the standard free drop-in, but now
// requires an API key too (tiles came back watermarked "API KEY REQUIRED").
// Esri's ArcGIS World_Light_Gray_Base tiles are still free/keyless for this
// kind of embedding — note the {z}/{y}/{x} order, which is Esri's own tile
// addressing, not a typo of the usual {z}/{x}/{y}.
const HEATMAP_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const HEATMAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, DeLorme, NAVTEQ';

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

// Report.location is now "Block X, Lot Y, <Street>" (see file-report.js's
// Block/Lot field) instead of just the street name, so a plain
// STREET_COORDINATES[name] lookup stopped matching anything and every
// report silently vanished from the heatmap. Falls back to whichever known
// street the location ends with, on a ", " boundary so "Blueberry Street"
// can't accidentally match something like "New Blueberry Street".
function resolveStreetCoord(locationName) {
  if (STREET_COORDINATES[locationName]) return STREET_COORDINATES[locationName];
  const match = Object.keys(STREET_COORDINATES).find((street) => locationName.endsWith(`, ${street}`));
  return match ? STREET_COORDINATES[match] : null;
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
      const coord = resolveStreetCoord(name);
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
