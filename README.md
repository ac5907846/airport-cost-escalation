# Airport Cost Escalation Explorer

Web app for the study of construction cost escalation across the airport project lifecycle during the IIJA funding surge. Each chart carries the label of the matching paper figure or table (Fig. 2a to Fig. 10, Table 2, Table 3). The app has four tabs, Map, Lifecycle, Tools and Data, and opens on the map. The six lifecycle stages sit inside the Lifecycle panel, where the numbered strip chooses one stage at a time, so nothing scrolls from one view to the next. The address bar carries the open view, for example `#lifecycle/bids`.

## Structure

```
05_web_app/
  index.html        page shell, tab strip and section text
  css/styles.css    layout, light theme tokens, animation classes
  js/main.js        starts both tab levels and every section
  js/lib/           shared helpers (tabs, chart cards, tooltips, controls, number formats, tokens, data loading)
  js/sections/      overview (intro and stage strip), map, funding, planning, bids, award,
                    postaward, synthesis, about
  js/tools/         bid escalation and competition check, airport estimate explorer
  data/             JSON exported from the processed analysis outputs
```

The page is static. It loads D3 7.9.0 from jsDelivr and reads everything else from `data/`.

## Live site

https://airport.electriai.com

## Deploy

`wrangler.jsonc` points at `public/`, which is a copy of the four served folders and `index.html`, so nothing from the
working tree such as `.git` is uploaded. To publish a change:

```
cd 05_web_app
mkdir -p public && cp -r index.html README.md css js data public/
npx wrangler deploy
```

## Run locally

```
cd 05_web_app
python -m http.server 8765
```

Then open http://127.0.0.1:8765/index.html. Opening `index.html` directly from the file system does not work because the browser blocks module scripts and JSON requests on `file://` pages.

## Refresh the data

The JSON files are written by `02_analysis/build_web_data.py` from the processed outputs of analyses 01 to 11:

```
python 02_analysis/build_web_data.py
```

## Deploy

Push the folder to GitHub and create a Cloudflare Pages project from the repository with no build command and `05_web_app` as the output directory (or the repository root if the app is published on its own). Then add a custom domain such as `airport-escalation.electriai.com` in the Pages project settings.
