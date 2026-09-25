(() => {
  "use strict";
  const embedded = window.self !== window.top;
  if (embedded) document.documentElement.classList.add("is-embedded");
  const app = document.querySelector(".map-app");
  const detail = document.getElementById("trip-detail");
  const error = document.getElementById("map-error");
  const markers = new Map();
  let selectedId = null;
  let lastTrigger = null;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }
  if (!window.L) {
    showError("The map could not load. Please refresh to try again.");
    return;
  }

  const worldBounds = [[-85.05112878, -180], [85.05112878, 180]];
  const map = L.map("travel-map", {
    zoomControl: false,
    minZoom: 0,
    maxZoom: 18,
    zoomSnap: 0,
    zoomDelta: 0.5,
    worldCopyJump: false,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1,
    scrollWheelZoom: true
  });
  L.control.zoom({ position: "topright" }).addTo(map);
  // Leaflet's BSD notice is retained with the locally hosted library.
  // OSM origin and licence are stated directly, without outbound navigation.
  map.attributionControl.setPrefix(false);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors · Open Database License",
    noWrap: true,
    bounds: worldBounds,
    maxZoom: 18
  }).addTo(map);
  let tileFailures = 0;
  tiles.on("tileerror", () => {
    if (++tileFailures >= 3) showError("Some map details could not load. Check your connection, then refresh.");
  });
  tiles.on("tileload", () => {
    tileFailures = 0;
    if (error.textContent.startsWith("Some map")) error.hidden = true;
  });

  // Fractional zoom fits the world to the pane, with no empty tile margins.
  function resizeMap(reset = false) {
    const surface = document.getElementById("travel-map");
    if (!surface.clientWidth || !surface.clientHeight) return;
    map.invalidateSize({ pan: false });
    const minZoom = Math.max(0, Math.log2(Math.max(surface.clientWidth, surface.clientHeight) / 256));
    map.setMinZoom(minZoom);
    if (reset || selectedId === null) {
      map.setView([0, 0], minZoom, { animate: false });
    } else map.panInsideBounds(worldBounds, { animate: false });
  }
  resizeMap(true);
  new ResizeObserver(() => resizeMap()).observe(document.getElementById("travel-map"));

  function notifyParent(open) {
    if (embedded) window.parent.postMessage({ type: "travel-map:detail", open }, location.origin);
  }
  function closeDetail(restoreFocus = false) {
    detail.hidden = true;
    app.classList.remove("has-trip");
    selectedId = null;
    markers.forEach(marker => marker.getElement()?.setAttribute("aria-expanded", "false"));
    notifyParent(false);
    requestAnimationFrame(() => resizeMap(true));
    if (restoreFocus && lastTrigger?.isConnected) lastTrigger.focus();
  }
  document.getElementById("detail-close").addEventListener("click", () => closeDetail(true));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !detail.hidden) closeDetail(true);
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === "travel-map:reset") closeDetail();
  });

  function photoURL(src) {
    if (typeof src !== "string" || !src.trim()) return null;
    try {
      const url = new URL(src, location.href);
      return url.protocol === "https:" || url.origin === location.origin ? url.href : null;
    } catch { return null; }
  }
  function optionalText(id, value) {
    const element = document.getElementById(id);
    const hasValue = typeof value === "string" && value.trim();
    element.textContent = hasValue ? value : "To be added";
    element.classList.toggle("empty-value", !hasValue);
  }
  function selectTrip(trip, trigger) {
    selectedId = trip.id;
    lastTrigger = trigger;
    document.getElementById("trip-title").textContent = trip.title;
    document.getElementById("trip-location").textContent = trip.location || "";
    optionalText("trip-date", trip.date);
    optionalText("trip-bio", trip.bio);
    const photos = document.getElementById("trip-photos");
    photos.replaceChildren();
    (trip.photos || []).forEach(photo => {
      const src = photoURL(photo.src);
      if (!src) return;
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = src;
      img.alt = photo.alt || trip.title;
      img.loading = "lazy";
      figure.append(img);
      if (photo.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = photo.caption;
        figure.append(caption);
      }
      photos.append(figure);
    });
    document.getElementById("photos-empty").hidden = photos.childElementCount > 0;
    detail.hidden = false;
    app.classList.add("has-trip");
    detail.scrollTop = 0;
    markers.forEach((marker, id) => marker.getElement()?.setAttribute("aria-expanded", String(id === selectedId)));
    notifyParent(true);
    requestAnimationFrame(() => {
      resizeMap();
      const zoom = Number.isFinite(trip.zoom) ? Math.min(18, Math.max(map.getMinZoom(), trip.zoom)) : Math.max(map.getMinZoom(), 4);
      map.setView([trip.lat, trip.lng], zoom, { animate: false });
    });
    document.getElementById("detail-close").focus({ preventScroll: true });
  }

  fetch("trips.json", { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error("Trip list unavailable");
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data)) throw new Error("Invalid trip list");
      const ids = new Set();
      data.forEach(trip => {
        if (!trip || typeof trip.id !== "string" || !trip.id || ids.has(trip.id) || typeof trip.title !== "string" || !trip.title.trim() || !Number.isFinite(trip.lat) || Math.abs(trip.lat) > 85 || !Number.isFinite(trip.lng) || Math.abs(trip.lng) > 180 || (trip.photos !== undefined && (!Array.isArray(trip.photos) || trip.photos.some(photo => !photo || typeof photo.src !== "string")))) throw new Error("Invalid trip entry");
        ids.add(trip.id);
      });
      const icon = L.divIcon({ className: "trip-dot", iconSize: [24, 24], iconAnchor: [12, 12], html: "" });
      data.forEach(trip => {
        const marker = L.marker([trip.lat, trip.lng], { icon, title: trip.title, alt: trip.title, keyboard: true, riseOnHover: true }).addTo(map);
        const label = document.createElement("span");
        label.textContent = trip.title;
        marker.bindTooltip(label, { direction: "top", offset: [0, -8] });
        marker.getElement().setAttribute("aria-controls", "trip-detail");
        marker.getElement().setAttribute("aria-expanded", "false");
        marker.on("click", () => selectTrip(trip, marker.getElement()));
        markers.set(trip.id, marker);
      });
    })
    .catch(() => showError("Trip notes are unavailable right now. You can still explore the map."));
})();
