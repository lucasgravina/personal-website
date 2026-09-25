(() => {
  "use strict";
  const embedded = window.self !== window.top;
  if (embedded) document.documentElement.classList.add("is-embedded");
  const app = document.querySelector(".map-app");
  const detail = document.getElementById("trip-detail");
  const overview = document.getElementById("countries-overview");
  const countryList = document.getElementById("country-list");
  const error = document.getElementById("map-error");
  const markers = new Map();
  let selectedId = null;
  let lastTrigger = null;
  let resetPending = true;
  let overviewCenter = [18, 0];

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

  // Keep the map scale consistent across the list and trip-detail views.
  function resizeMap(reset = false) {
    if (reset) resetPending = true;
    const surface = document.getElementById("travel-map");
    if (!surface.clientWidth || !surface.clientHeight) return;
    map.invalidateSize({ pan: true, animate: false });
    const minZoom = Math.max(0, Math.log2(app.clientWidth / 256), Math.log2(app.clientHeight / (256 * 0.6)));
    map.setMinZoom(minZoom);
    if (resetPending) {
      map.setView(overviewCenter, minZoom, { animate: false });
      resetPending = false;
    } else map.panInsideBounds(worldBounds, { animate: false });
  }
  resizeMap(true);
  new ResizeObserver(() => resizeMap()).observe(document.getElementById("travel-map"));

  function closeDetail(restoreFocus = false, reset = false) {
    detail.hidden = true;
    overview.hidden = false;
    selectedId = null;
    markers.forEach(marker => marker.getElement()?.setAttribute("aria-expanded", "false"));
    if (reset) {
      resetPending = true;
      overview.scrollTop = 0;
    }
    requestAnimationFrame(() => resizeMap());
    if (restoreFocus && lastTrigger?.isConnected) lastTrigger.focus();
  }
  document.getElementById("detail-close").addEventListener("click", () => closeDetail(true));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !detail.hidden) closeDetail(true);
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === "travel-map:reset") closeDetail(false, true);
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
    overview.hidden = true;
    detail.scrollTop = 0;
    markers.forEach((marker, id) => marker.getElement()?.setAttribute("aria-expanded", String(id === selectedId)));
    requestAnimationFrame(() => {
      resizeMap();
      if (Number.isFinite(trip.zoom)) {
        map.setView([trip.lat, trip.lng], Math.min(18, Math.max(map.getMinZoom(), trip.zoom)), { animate: false });
      } else map.panInside([trip.lat, trip.lng], { padding: [30, 30], animate: false });
    });
    document.getElementById("detail-close").focus({ preventScroll: true });
  }

  function renderCountries(trips) {
    // Map insertion order preserves Lucas's list, grouping the two US stops.
    const countries = new Map();
    trips.forEach(trip => {
      const country = trip.country || trip.title;
      if (!countries.has(country)) countries.set(country, []);
      countries.get(country).push(trip);
    });
    countryList.replaceChildren();
    countries.forEach((stops, country) => {
      const item = document.createElement("li");
      const row = document.createElement(stops.length === 1 ? "button" : "div");
      row.className = "country-row";
      const flag = document.createElement("span");
      flag.className = "country-flag";
      flag.setAttribute("aria-hidden", "true");
      const code = stops[0].countryCode;
      flag.textContent = /^[A-Z]{2}$/.test(code || "")
        ? [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("")
        : "";
      const name = document.createElement("span");
      name.className = "country-name";
      name.textContent = country;
      row.append(flag, name);
      if (stops.length === 1) {
        row.type = "button";
        row.setAttribute("aria-controls", "trip-detail");
        row.addEventListener("click", () => selectTrip(stops[0], row));
        const arrow = document.createElement("span");
        arrow.className = "country-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        row.append(arrow);
      }
      item.append(row);
      if (stops.length > 1) {
        const list = document.createElement("ul");
        list.className = "country-stops";
        stops.forEach(trip => {
          const stop = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "country-stop";
          button.textContent = trip.listLabel || trip.title;
          button.setAttribute("aria-controls", "trip-detail");
          button.addEventListener("click", () => selectTrip(trip, button));
          stop.append(button);
          list.append(stop);
        });
        item.append(list);
      }
      countryList.append(item);
    });
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
      if (data.length) {
        const latitudes = data.map(trip => trip.lat);
        const longitudes = data.map(trip => trip.lng);
        overviewCenter = [
          (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
          (Math.min(...longitudes) + Math.max(...longitudes)) / 2
        ];
        resizeMap(true);
      }
      const icon = L.divIcon({ className: "trip-pin", iconSize: [24, 30], iconAnchor: [12, 24], html: "" });
      data.forEach(trip => {
        const marker = L.marker([trip.lat, trip.lng], { icon, title: trip.title, alt: trip.title, keyboard: true, riseOnHover: true }).addTo(map);
        const label = document.createElement("span");
        label.textContent = trip.title;
        marker.bindTooltip(label, { direction: "top", offset: [0, -19] });
        marker.getElement().setAttribute("aria-controls", "trip-detail");
        marker.getElement().setAttribute("aria-expanded", "false");
        marker.on("click", () => selectTrip(trip, marker.getElement()));
        markers.set(trip.id, marker);
      });
      renderCountries(data);
    })
    .catch(() => showError("Trip notes are unavailable right now. You can still explore the map."));
})();
