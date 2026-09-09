# Asset Sources

## Existing Image Assets

- Wall, floor, and ceiling textures: ambientCG materials, CC0 1.0 Universal.
  See `assets/textures/manifest.json`.
- Jazz musician portraits: Wikimedia Commons images with per-file license and
  credit metadata in `assets/musicians/manifest.json`.
- WordPress admin screenshots: captured from WordPress Playground. See
  `assets/wp-screenshots/manifest.json`.
- Wapuu original SVG and PNG: official Wapuu artwork, GPLv2 or later. See
  `assets/wapuu/manifest.json`. Wall Wapuu variations live in
  `assets/wapuu/variations/` and come from Wapuu Studio.
- WordPress logo PNGs in `assets/logos/`: the official W mark and logotype
  lockup from the WordPress brand resources (https://wordpress.org/about/logos/),
  used here to present the project's own identity; the WordPress marks are
  trademarks of the WordPress Foundation.

## Design Exploration Assets

The additional design explorations use procedural canvas textures and Three.js
geometry authored in this repository, plus a small subset of CC0 Kenney GLB
models vendored in `assets/models/kenney`. See `assets/models/manifest.json`.

The model subset includes lightweight benches, plants, computers, lights,
structural pieces, and other museum props from Kenney's Furniture Kit, Retro
Urban Kit, and Building Kit. Each original pack declares Creative Commons Zero
(CC0), and the copied license text is stored next to each subset.

## Research Notes

- ambientCG publishes its materials under CC0 1.0 Universal.
- WordPress logo assets have trademark usage guidance, so the explorations use
  WordPress text and procedural museum marks rather than downloaded or modified
  official logo files. The default museum now uses the original Wapuu SVG as
  mascot artwork with source and license metadata.
- Wall Wapuu variations are from Wapuu Studio: https://wapuu.studio/.
- Kenney publishes the selected 3D packs under Creative Commons Zero (CC0):
  Furniture Kit, Retro Urban Kit, and Building Kit.
- The cathedral ceiling, full-height columns, vault ribs, chandelier, room
  pilasters, and open-source exhibit structures are procedural Three.js
  geometry authored in this repository. No additional third-party binary models
  were imported for this pass.
