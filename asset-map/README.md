# Asset Map

An interactive map for logging assets and the links that go with them
(manuals, drawings, photos, tickets). Built with [Leaflet](https://leafletjs.com)
and OpenStreetMap, so no API key or billing is needed. It's a static page, so
anyone with the link can view it.

## What it does

- A coloured marker for each asset, grouped by category. Click a marker to see
  its status, notes and links.
- Search and a category filter in the sidebar. Click an item to jump to it.
- Switch between Streets and Satellite views (top-right of the map).
- **Edit assets** mode: click the map to add an asset, drag markers to move
  them, and edit or delete them from their popup. Then use **Export CSV** to
  save the result as `assets.csv`.

## Where the data lives

Assets come from a CSV with these columns:

| column   | example |
|----------|---------|
| id       | `pump-01` (any unique text; generated if blank) |
| name     | `Pump Station A` |
| category | `Pumps` |
| lat, lng | `51.5079`, `-0.0877` |
| status   | `Active` |
| notes    | free text |
| links    | `Manual\|https://…; Photos\|https://…` (label is optional) |

The `assets.csv` in this folder holds example rows. Replace them with your
own assets.

You have two ways to keep the data:

1. **CSV in this repo.** Edit on the map, click **Export CSV**, and commit
   the file over `asset-map/assets.csv`. Everyone sees the change on their
   next reload.
2. **Google Sheet.** Recommended if several people update assets. Make a
   sheet with the columns above, then go to *File → Share → Publish to web*,
   pick the sheet, choose *Comma-separated values (.csv)*, and copy the link.
   Paste it into `SHEET_CSV_URL` at the top of `app.js`. After that, edits to
   the sheet show on the map for everyone, with no commits needed. You can
   still use Edit mode and Export CSV to place pins, then paste the rows into
   the sheet.

Edits made in Edit mode are kept only in your own browser until you export
them. **Discard changes** goes back to the shared data.

## Publishing it

The workflow in `.github/workflows/pages.yml` deploys this folder to GitHub
Pages whenever `main` changes:

1. Merge this branch into `main`.
2. In the repo, open *Settings → Pages* and set **Source** to **GitHub Actions**.
3. The map will be live at `https://<your-username>.github.io/<repo-name>/`.

Note: GitHub Pages sites are public on free plans. Anyone with the URL can
see the map. Don't put sensitive information in it.

## Trying it locally

```sh
cd asset-map
python3 -m http.server 8000
# open http://localhost:8000
```

(You need to serve the folder like this. Opening `index.html` directly from
disk won't load the CSV.)
