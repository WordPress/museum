# WordPress Museum

A standalone Three.js prototype for browsing WordPress release history as a
museum.

The default museum uses local open-license image assets, and the additional
design explorations use procedural canvas textures and Three.js geometry
generated at runtime.

## Preview

https://janjakes.github.io/wordpress-museum/

## Design Explorations

The default URL keeps the current museum design. Additional explorations are
served as static query-param variants, so GitHub Pages can preview them without
duplicating the app:

https://janjakes.github.io/wordpress-museum/explorations.html

Example:

https://janjakes.github.io/wordpress-museum/?variant=pixel-lobby-block-party

## Run

```bash
npm run dev
```

Then open `http://127.0.0.1:4173/`.

The local server sends CORS headers so the "Open in Playground" links can load
the Blueprint JSON files from this repo.

See `ASSET_SOURCES.md` for asset provenance and licensing notes.
