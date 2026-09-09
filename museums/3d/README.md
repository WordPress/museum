# 3D WordPress Museum

A standalone Three.js museum covering WordPress 0.7–6.2 (2003–2023). Imported from
[JanJakes/wordpress-museum](https://github.com/JanJakes/wordpress-museum) at
`1eebdb6d138e661453a1c9eb965671a259061a6f`. See the root
[CREDITS.md](../../CREDITS.md) for the source record.

## Run and check

From the repository root:

```bash
sfw npm start
sfw npm --prefix museums/3d run check
```

Open <http://127.0.0.1:4173/3d/>. `sfw npm run dev` from this directory
starts the same shared server. No dependency installation or build is needed.

The root `sfw npm run check` includes this experience's checks. After editing
local scripts or styles, run `node scripts/stamp-cache-version.mjs` from this
directory to update the entry point's cache versions.

## Files and dependencies

- `index.html`, `museum.js`, and `style.css` contain the main experience.
- `museum-data.js` owns the historical dataset and Blueprint references. Its
  schema and 2003–2023 scope differ from the Desktop and Winamp dataset.
- `explorations.html`, `explorations.js`, and `museum-variants.js` provide design
  variants, such as `./?variant=permalink-pinball-palace`.
- `assets/` contains textures, portraits, screenshots, Wapuus, logos, models,
  and their source records. See [ASSET_SOURCES.md](ASSET_SOURCES.md).
- `blueprints/` contains the imported Playground time-capsule posts.
- `playground.js` adapts Blueprint return links to the current museum URL when
  opening Playground. The committed Blueprint snapshots remain unchanged.
- `museum.json` explicitly lists the public files. Tools and tests are excluded.

The browser loads Three.js **0.171.0** and its GLTF loader from jsDelivr, and
Press Start 2P, VT323, and Special Elite from Google Fonts, as in the source
snapshot. The 3D experience needs WebGL and an internet connection for these
resources and WordPress Playground. Runtime dependencies remain separate from
the other experiences.

## Deployment

The root publishing tools include this experience automatically through its
manifest. Preview it at `/museum/3d/` on GitHub Pages or on the WordPress Museum
site after the plugin is deployed. Both deployments support
`?variant=` and `?release=` links. The design gallery is `explorations.html`.

Blueprints are fetched from this experience, then embedded into Playground's URL
fragment. Their dispatch links return to the current deployment in a new tab.
Opening a raw Blueprint outside the museum retains its original upstream return
link. The upstream Blueprint generator is not included in this repository.
