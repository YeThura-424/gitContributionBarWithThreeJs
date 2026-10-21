# 3D contribution graph

Serve this folder with a local HTTP server and open `index.html`. The generated
`dist/style.css` is included so the page can run without a CSS build step.

## Styling

The layout and components use Tailwind CSS utilities in `index.html` and the
year button template in `js/ui/profile.js`. `style.css` contains the Tailwind
entry point, palette variables, and shared accessibility defaults.

With Node.js installed:

```sh
npm install
npm run build
npm run dev
npm test
```

`npm run dev` builds the CSS, starts the site at **http://localhost:5173**, and
watches Tailwind sources for changes. Refresh the browser after editing files.
Press **Ctrl+C** to stop both the server and CSS watcher.

Rebuild `dist/style.css` after changing utility classes. Tailwind CLI setup:
https://tailwindcss.com/docs/installation/tailwind-cli

## JavaScript

- `main.js`: application startup.
- `js/config.js`: graph dimensions and theme constants.
- `js/utils/dates.js`: general date helpers.
- `js/utils/random.js`: seeded random number helper.
- `js/data/contributions.js`: sample data, API data normalization, intensity levels.
- `js/graph/createGraph.js`: scene setup, bars, labels, camera, animation, hover, palettes.
- `js/ui/profile.js`: profile loading, request ordering, year controls, header, statistics.

The graph factory owns rendering state and exposes only graph building, loading,
and loading status to the profile controller. General utilities have no DOM dependencies.
