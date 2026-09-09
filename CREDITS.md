# Credits and source record

## Imported experiences

The two experiences were adapted by their author from
[`adamziel/wordpress-museum`](https://github.com/adamziel/wordpress-museum) at
commit `6af761633a59996d4a1f11019debe26e444e0344`:

| Destination | Source path | Source SHA-256 |
| --- | --- | --- |
| `museums/desktop/index.html` | `v1-desktop/index.html` | `7cad91c74f9b6a813d69f9a16ce6056951a93beeea0f13d11b4a8d65e0de738f` |
| `museums/winamp/index.html` | `v2-winamp/index.html` | `2af45926de86232a14498e5b7b57f36fa1137f3256507f102c9dc351c33ef6eb` |

The imported copies now use one release dataset, locally hosted fonts, and the
correct WordPress 6.9 and 7.0 release records.

Release names and dates were checked against the official
[WordPress release history](https://wordpress.org/about/history/), including the
[WordPress 6.9 “Gene”](https://wordpress.org/news/2025/12/gene/) and
[WordPress 7.0 “Armstrong”](https://wordpress.org/news/2026/05/armstrong/)
announcements.

## Fonts

- **Press Start 2P**, CodeMan38, SIL Open Font License 1.1. Source:
  [`google/fonts/ofl/pressstart2p`](https://github.com/google/fonts/tree/main/ofl/pressstart2p).
- **VT323**, Peter Hull, SIL Open Font License 1.1. Source:
  [`google/fonts/ofl/vt323`](https://github.com/google/fonts/tree/main/ofl/vt323).

The license text for each font is stored beside the font file.

## 3D Museum

[`JanJakes/wordpress-museum`](https://github.com/JanJakes/wordpress-museum) was
imported at Jan's request into `museums/3d/` from the current `trunk` snapshot,
commit [`1eebdb6d138e661453a1c9eb965671a259061a6f`](https://github.com/JanJakes/wordpress-museum/commit/1eebdb6d138e661453a1c9eb965671a259061a6f),
on 2026-09-09. The import copies the tracked files without their Git history.

The snapshot contains the Three.js museum, design explorations, its 2003–2023
release dataset, Playground Blueprints, and local image and model assets. It
has no top-level project license file. The import retains all supplied
third-party license files and per-asset source records; see
[`museums/3d/ASSET_SOURCES.md`](museums/3d/ASSET_SOURCES.md) and the manifests under
[`museums/3d/assets/`](museums/3d/assets/). Those asset licenses remain distinct
from this repository's GPL-2.0 code license.
