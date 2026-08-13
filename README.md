# WordPress Museum

Three interactive views of WordPress release history:

- **Desktop** — releases as shortcuts in an early-2000s desktop.
- **Winamp** — releases as tracks in a music-player timeline.
- **Kubrick** — releases as posts in a classic WordPress weblog.

![Desktop, Winamp, and Kubrick museum experiences](docs/experiences.webp)

## Structure

```text
.
├── index.html                 # Static preview index; not the production landing page.
├── desktop/index.html
├── winamp/index.html
├── kubrick/index.html
├── data/releases.js           # Shared release history.
├── assets/fonts/              # Locally served fonts and their licenses.
├── museum.php                 # Thin WordPress routing adapter.
└── scripts/check-static.mjs   # Dependency-free repository checks.
```

The experiences are ordinary HTML, CSS, and JavaScript. There is **no frontend
build step**. The files committed to the repository are the files the browser
runs.

That is deliberate. These experiences have no server state and no need for a
framework or bundler. Add a build step only when source files genuinely need
compilation or optimization. Keep generated output out of the design until
then.

## Local preview

```bash
npm start
```

Open <http://127.0.0.1:4173/>. Run the checks with:

```bash
npm run check
php -l museum.php
```

Opening an individual HTML file directly also works.

## wordpress.org deployment

`https://wordpress.org/museum/` is already a separate WordPress site. Its
landing page should remain normal WordPress content so editors can change the
introduction and navigation without shipping code.

The full-screen experiences should not be pasted into Custom HTML blocks. They
own the entire viewport, and their styles and scripts should not share a page
with a WordPress theme. GitHub Pages is useful for previews, but it cannot claim
only the `/museum` path on `wordpress.org`.

`museum.php` provides the small integration layer:

| URL | File |
| --- | --- |
| `/museum/desktop/` | `desktop/index.html` |
| `/museum/winamp/` | `winamp/index.html` |
| `/museum/kubrick/` | `kubrick/index.html` |

It also serves the shared release data and local fonts at stable same-origin
URLs. The route map is explicit; a newly committed file is not public until its
route is reviewed.

Production still needs one infrastructure step: coordinate with the WordPress
Meta team to sync this repository as the `wporg-museum` plugin and activate it
only on the Museum site. Activation installs the rewrite rules. Do not add an
automatic production deployment workflow until that server-side contract is
confirmed.

The root `index.html` is only a portable preview for local servers or GitHub
Pages. WordPress continues to render the production `/museum/` landing page.

## Adding an experience

1. Add a directory containing an `index.html` entry point.
2. Keep its assets inside that directory, or use an existing shared asset.
3. Add its public route to `assets()` in `museum.php`.
4. Add it to the preview index.
5. Run the checks and test keyboard, narrow-screen, and reduced-motion behavior.

## Origins and licenses

See [CREDITS.md](CREDITS.md). Repository code is licensed under GPL-2.0. The
bundled fonts retain their own SIL Open Font License files.
