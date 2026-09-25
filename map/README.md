# Travel map

The Maps dock icon opens this flat map inside the desktop. `/map/` also works on phones and in its own tab.

## Adding trips over time

Published places live in `trips.json`. Start with just a dot and a title; add the date, description, and photos whenever ready. No locations are inferred from photos or other personal data. Budapest is the first user-requested pin; its date, description, and photos are intentionally empty.

The app opens as a square map. Selecting a pin widens the desktop window to reveal a right-hand detail pane with Where, Date, About, and Photos. Closing the detail pane returns to the world view; closing and reopening Maps resets it too. There is no internal header or welcome overlay.

Add entries to the JSON array, for example (illustrative only, not a claim about Lucas’s travels):

```json
[
  {
    "id": "trip-slug",
    "title": "Trip title",
    "location": "Town, country",
    "lat": 46.0207,
    "lng": 7.7491,
    "date": "Summer 2026",
    "bio": "A short story about the trip.",
    "photos": [
      {
        "src": "../assets/trips/trip-slug/photo.jpg",
        "alt": "Description of the photo",
        "caption": "Optional caption"
      }
    ]
  }
]
```

Only `id`, `title`, `lat`, and `lng` are required. IDs must be unique. Latitude is limited to -85 to 85 for the map projection; longitude is -180 to 180. Optional `zoom` sets the level when opening a trip (default 4, up to 18). Photo paths are relative to `/map/`; HTTPS image URLs also work. Empty optional fields display “To be added.”

Commit the JSON and any added photos to the GitHub Pages branch to publish them. You can also send the locations, photos, and descriptions to your website assistant to add them. There is no visitor-facing editing or location tracking.

The map uses locally hosted Leaflet 1.9.4 (BSD-2-Clause, included in `assets/vendor/leaflet/LICENSE`) and OpenStreetMap’s standard raster tiles. Required OSM attribution and the Open Database License name remain visible as plain text; there are no outbound links in the map. Leaflet's optional on-screen credit is removed; its licence file is retained. Tiles load only when the Maps app opens; no offline prefetching or tile downloads are implemented.
