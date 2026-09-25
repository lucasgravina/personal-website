(() => {
  "use strict";
  if (window.self !== window.top) document.documentElement.classList.add("is-embedded");

  const error = document.getElementById("map-error");
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }
  if (!window.L) {
    showError("The map could not load. Please refresh to try again.");
    return;
  }

  const map = L.map("travel-map", {
    zoomControl: false,
    minZoom: 1,
    maxZoom: 18,
    worldCopyJump: false,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1,
    scrollWheelZoom: true
  });
  L.control.zoom({ position: "topright" }).addTo(map);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
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

  function showWorld() {
    map.fitBounds([[-52, -170], [78, 178]], { padding: [4, 4], animate: false });
  }
  showWorld();
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(document.getElementById("travel-map"));

  const panel = document.getElementById("places-panel");
  const toggle = document.getElementById("places-toggle");
  const detail = document.getElementById("trip-detail");
  const note = document.getElementById("map-note");
  const list = document.getElementById("trip-list");
  const markers = new Map();
  let trips = [];
  let selectedId = null;
  let lastTrigger = null;

  function closeDetail(restoreFocus = false) {
    detail.hidden = true;
    selectedId = null;
    list.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", "false"));
    if (restoreFocus && lastTrigger?.isConnected) lastTrigger.focus();
  }
  document.getElementById("detail-close").addEventListener("click", () => closeDetail(true));
  document.getElementById("reset-map").addEventListener("click", () => {
    closeDetail();
    showWorld();
  });
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    map.invalidateSize({ pan: false });
    if (!panel.hidden) document.getElementById("trip-search").focus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !detail.hidden) closeDetail(true);
    else if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      map.invalidateSize({ pan: false });
      toggle.focus();
    }
  });

  function photoURL(src) {
    if (typeof src !== "string" || !src.trim()) return null;
    const url = new URL(src, location.href);
    return url.protocol === "https:" || url.origin === location.origin ? url.href : null;
  }

  function selectTrip(trip, trigger) {
    selectedId = trip.id;
    lastTrigger = trigger;
    document.getElementById("trip-title").textContent = trip.title;
    document.getElementById("trip-date").textContent = trip.date || "";
    document.getElementById("trip-location").textContent = trip.location || "";
    document.getElementById("trip-bio").textContent = trip.bio || "Photos and notes to come.";
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
    detail.hidden = false;
    detail.scrollTop = 0;
    if (window.innerWidth <= 600) {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
    map.invalidateSize({ pan: false });
    map.setView([trip.lat, trip.lng], Math.max(map.getZoom(), trip.zoom || 5), { animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
    list.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.trip === selectedId)));
    document.getElementById("detail-close").focus({ preventScroll: true });
  }

  function renderList() {
    const query = document.getElementById("trip-search").value.trim().toLocaleLowerCase();
    const filtered = trips.filter(trip => `${trip.title} ${trip.location || ""} ${trip.date || ""}`.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    filtered.forEach(trip => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trip-list-item";
      button.dataset.trip = trip.id;
      button.setAttribute("aria-pressed", String(selectedId === trip.id));
      const title = document.createElement("strong");
      title.textContent = trip.title;
      const subtitle = document.createElement("span");
      subtitle.textContent = [trip.location, trip.date].filter(Boolean).join(" · ");
      button.append(title, subtitle);
      button.addEventListener("click", () => selectTrip(trip, button));
      list.append(button);
    });
    document.getElementById("search-empty").hidden = filtered.length > 0;
  }
  document.getElementById("trip-search").addEventListener("input", renderList);

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
      trips = data;
      note.hidden = trips.length > 0;
      toggle.hidden = trips.length === 0;
      toggle.textContent = `Places · ${trips.length}`;
      const icon = L.divIcon({ className: "trip-dot", iconSize: [24, 24], iconAnchor: [12, 12], html: "" });
      trips.forEach(trip => {
        const marker = L.marker([trip.lat, trip.lng], { icon, title: trip.title, alt: trip.title, keyboard: true, riseOnHover: true }).addTo(map);
        const label = document.createElement("span");
        label.textContent = trip.title;
        marker.bindTooltip(label, { direction: "top", offset: [0, -8] });
        marker.on("click", () => selectTrip(trip, marker.getElement()));
        markers.set(trip.id, marker);
      });
      renderList();
    })
    .catch(() => {
      note.hidden = true;
      showError("Trip notes are unavailable right now. You can still explore the map.");
    });
})();
