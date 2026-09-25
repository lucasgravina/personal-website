# Travel map

The Maps dock icon opens this flat map inside the desktop. `/map/` also works on phones and in its own tab.

## Adding trips over time

Published places live in `trips.json`. Start with just a dot and a title; add the date, description, and photos whenever ready. No locations are inferred from photos or other personal data. The initial list is intentionally empty.

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

Only `id`, `title`, `lat`, and `lng` are required. IDs must be unique. Latitude is limited to -85 to 85 for the map projection; longitude is -180 to 180. Optional `zoom` sets the level when opening a trip (default 5, up to 18). Photo paths are relative to `/map/`; HTTPS image URLs also work.

Commit the JSON and any added photos to the GitHub Pages branch to publish them. You can also send the locations, photos, and descriptions to your website assistant to add them. There is no visitor-facing editing or location tracking.

The map uses locally hosted Leaflet 1.9.4 (BSD-2-Clause, included in `assets/vendor/leaflet/LICENSE`) and OpenStreetMap’s standard raster tiles. Attribution remains visible. Tiles load only when the Maps app opens; no offline prefetching or tile downloads are implemented.
