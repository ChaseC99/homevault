# Jigsaw Homevault

A mobile-first, local-only PWA for a professional home organizer. The working flow is property setup → rooms → room overviews or item photography → photo grouping → details and receipt review → US-letter PDF export.

## Run

Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. This is a static production preview; the server only delivers application files. Data, images, OCR, and reports stay in the browser. Use one consistent URL: `localhost`, `127.0.0.1`, different ports, and different HTTPS hosts each have separate storage.

For source development, use `npm run dev` (port 5173). Development mode intentionally does not install the offline worker. Validate offline use against the production build.

The repository includes the local OCR model, WASM engine, PDF worker, fonts, and app icons. `npm run assets` refreshes OCR/PDF assets after dependency updates. Run it before rebuilding if those packages change. Report fonts are derived from the included Inter variable font under the SIL Open Font License; no runtime font downloads occur.

## Use on a phone

1. Serve `dist/` at a **trusted HTTPS URL**, using the same path configured when building (see GitHub Pages below). Any static HTTPS host or a locally trusted HTTPS development proxy works. The app has no backend or login. A plain `http://<computer-LAN-IP>:4173` address is not sufficient for service workers and live phone-camera access.
2. Open in Safari on iPhone, or a current Chromium browser on Android. Open **Organizer & device** and keep the app open until **Ready offline** appears there. The initial bundle is about 51 MB because it includes the English OCR model and all required reader assets.
3. iPhone: Share → Add to Home Screen. Android: use the browser's Install app action.
4. Launch from the installed icon; confirm offline readiness there before visiting a home. Turn on airplane mode and try importing a photo, reading a receipt, and generating a report.
5. Allow camera access when you enter either capture flow. If live capture is unavailable, the shutter opens the phone camera and Import photos is shown. More camera options also offers import, native capture, and retry. Live capture feature-detects `ImageCapture.takePhoto()`; More camera options identifies when the fallback uses video resolution. Serial-number readability, focus, and iPhone-specific quality still need hands-on hardware testing.

Close all Homevault tabs/windows and reopen to apply a newly built app version. The service worker waits for the prior version to close to avoid interrupting an active session.

## GitHub Pages

The deployment workflow is `.github/workflows/deploy.yml`. For `ChaseC99/homevault`, the default site address is **https://chasec99.github.io/homevault/**.

1. Push this project, including `public/`, `package-lock.json`, and `.github/`, to the repository's `main` branch. The bundled OCR model, WASM files, PDF assets, icons, and report fonts are required; generated `dist/` and `node_modules/` stay out of Git.
2. In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow** if the initial push happened before Pages was enabled. Subsequent pushes to `main` build, test, and deploy automatically.

The workflow uses Node 24, installs the locked dependencies, refreshes bundled OCR/PDF assets, runs unit tests, builds the production app, and runs the browser suite before uploading only `dist/`. It reads the actual site path from GitHub Pages, so another repository name or a configured custom domain does not require editing source paths. If your default branch is not `main`, update the workflow trigger. No deployment secrets or personal access token are needed.

For a local check at the same subpath (macOS/Linux):

```sh
npm ci
npm test
BASE_PATH=/homevault/ npm run build
BASE_PATH=/homevault/ npm run test:e2e
BASE_PATH=/homevault/ npm run preview
```

Open **http://127.0.0.1:4173/homevault/**. Use the same `BASE_PATH` for the build, browser tests, and preview. Without it, all three use `/`. For another static host, set `BASE_PATH` to its URL path with leading/trailing slashes. The app uses hash navigation, so Pages does not need a custom 404 redirect.

The manifest launches within the configured path; its default identity comes from that launch URL. The service worker resolves assets from its own directory and only removes old caches for that app path. Runtime asset URLs use Vite's `BASE_URL`; see the [Vite base-path guidance](https://vite.dev/guide/build.html#public-base-path) and [Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

After deployment, confirm **Ready offline** in **Organizer & device**, install on a phone, then test offline reload, camera capture, receipt OCR, PDF export/sharing, and an update after closing all app windows. Inventories on localhost remain on localhost: deploying does not migrate browser storage or provide backup/sync.

## Workflow

- **Properties:** create the home with client contact information, an exterior photo, and walkthrough dates. Insurance details are available later in property information. Address entry supports the browser’s saved-address autofill. Add current location saves GPS coordinates and accuracy separately from the street address, after browser permission; it performs no external address lookup and has no API cost. Search by property, client, or address.
- **Rooms:** tap preset types repeatedly for automatic numbering, or add a custom room. Pending rooms remain visible in a sticky tray with the save action. Rename rooms later. Back navigation stays at the top while scrolling throughout the app.
- **Room overview:** tap the **+** tile beside the overview thumbnails to photograph the room. The first overview is the room cover; open another overview and choose **Make room cover** to change it. The room page combines sorting and missing-detail actions above the item list, with unreviewed items first. Rename the room through its **…** menu.
- **Camera shortcuts:** on a room page, the tab-bar camera opens item capture for that room and displays its name. On a property page, it preselects the property and asks for a room. Elsewhere, it opens the property/room chooser. Choosing a room opens the camera directly; changing property clears the room selection.
- **Item capture:** choose Add items and take all the photos for the room. Each photo saves immediately to the room’s unsorted photos; no item record is created until photos are grouped. Done opens Sort photos. The camera keeps the room name, shutter, thumbnail count, and one Done action visible; capture instructions and the duplicate sorting action are omitted. Tap the compact zoom value to reveal its slider; taking a photo collapses the slider while keeping the zoom setting. Live capture uses camera zoom when exposed by the browser, otherwise a digital crop that is also applied to the saved image. Native-camera capture uses the phone camera’s own controls. Tap the latest thumbnail to review it.
- **Import and persistence:** More camera options contains import and native-camera actions. Each photo and its record save in one transaction. Imports save sequentially; if one fails, the saved count is shown and remaining files can be retried. Unsorted photos survive reloads.
- **Sort / corrections:** select photos of the same item and tap **Group N photos**. The naming sheet shows those photos: enter a name and choose **Create item**, or **Name later** to save an unnamed group as Item 1, Item 2, and so on. Each group card shows its thumbnail, name, and photo count; **Add name** lets you name a skipped group without leaving sorting. Closing the sheet keeps the selection, and a failed save keeps the draft for retry. You can also append to an existing item or Undo the most recent grouping. Misclassified overviews can move to/from sorting. On an item, choose the first photo or return extra photos to sorting. The edit screen also removes photos, with Undo for the most recent removal; the item’s other details remain saved even when its last photo is removed.
- **Details:** category suggestions include Furniture, Electronics, Art, Decor, Appliances, Jewelry, and previously saved custom categories. Type any custom category. The serial-number scan button reads a label on-device and lets you review the suggestion before applying it. Drafts autosave after valid edits, and explicit save actions report write failures. Skip saves the draft. Mark reviewed is a deliberate action; missing receipts, names, dates, prices, and condition are allowed. A review flag is not evidence that every field is known.
- **Receipts:** attach images or PDFs. English on-device OCR suggests store/date, leaves unrecognized fields blank, and preserves the original and recognized text even when reading is partial or fails. Confirm whether a detected receipt total is the price of one unit or all units of this item before applying it; division is offered only for quantities above one. Receipts with multiple purchases need manual correction. Date parsing supports US numeric, ISO, and English month-name dates, including common spacing and OCR digit errors. Store suggestions remove common edge noise. Images and PDFs preview inside the app, with page navigation for PDFs and an optional original download.
- **Reports:** choose the property and include options. Unreviewed records retain all real entered information. Unsorted photos are labeled unassigned, excluded from counts/totals, and included when item photos are enabled. Reports have a cover/summary, room overviews and item summaries, detailed item pages, and optional receipt appendix (every PDF page). Download, open/print, or use the native share sheet when supported.
- **Organizer & device:** business details used by reports, offline readiness, approximate storage usage, and a request for persistent storage.

## Product decisions

- PWA prototype now; native Swift implementation later. The original undecided-platform statement in `handoff/HANDOFF.md` is superseded by this decision.
- Room overviews and item photography are separate flows. Item photos are captured first and grouped afterwards, per the latest feedback; existing item records and photos remain compatible.
- Properties are top-level. There are no client accounts, client grouping, shared organizers, cloud sync, backup service, or login.
- Purchase price is **per unit**, in USD. All monetary totals use integer cents × quantity. Unknown prices are excluded and distinguished from a recorded zero. Receipt totals are never automatically multiplied again. Dividing a receipt total rounds the per-unit price to cents and says so.
- Captured images/PDFs are kept as IndexedDB blobs alongside thumbnail blobs and metadata. This is the browser equivalent of local file storage, not a server upload. The PDF uses resized derivatives for manageable report size.
- IndexedDB commits metadata and imported assets in one transaction. Failed writes do not replace prior records. The application does not claim that browser storage is permanent. Clear-site-data, uninstall behavior, private browsing, device loss, and browser eviction can remove records. PDFs are exported records, not restorable backups.
- Missing receipts are normal. OCR is assistance for human review, not authoritative extraction. There are no fabricated prices or mock OCR outputs.
- No replacement cost, video capture, AI photo grouping, cloud OCR, or runtime CDN requests. Address autofill is supplied by the browser; global address autocomplete and reverse geocoding are not enabled. GPS coordinates remain local and do not replace a street address.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The browser suite uses generated, clearly synthetic fixtures in `tests/fixtures/` and an isolated browser profile. It does not access a real camera or personal browser data. The test runner starts the production preview if needed. On macOS it uses installed Chrome; see `playwright.config.ts` to select another executable or Playwright Chromium.

Validation artifacts and screenshots are written to `artifacts/`. `VALIDATION.md` records the completed checks and remaining device-specific limits.

## Source map

- `src/lib/model.ts`: domain rules, per-unit currency, grouping, and derived status/totals.
- `src/lib/db.ts`: atomic IndexedDB storage and storage-error handling.
- `src/lib/media.ts`: original/thumbnail image handling.
- `src/lib/ocr.ts`, `receipt-parser.ts`, `pdf-input.ts`: local receipt reading.
- `src/lib/report.ts`: local PDF layout and pagination.
- `src/components/`: capture, setup, sorting, details, in-app receipt previews, and report workflows.
- `scripts/build-sw.mjs`: versioned, complete static precache with readiness verification.
- `handoff/`: unchanged design references and original product handoff.

## Known prototype limits

English OCR and US date/currency conventions; OCR can misread stores, totals, and dates. Browser-decodable images (JPEG/PNG/WebP, plus HEIC where the browser supports it) are required. Unsupported files show a recoverable error. Encrypted/damaged receipt PDFs require replacement or exclusion from the appendix. Complex PDFs and very large inventories may take time or hit mobile memory limits. The bundled report font covers Latin, Greek and Cyrillic; additional scripts may need another local font. No backup/restore or permanent-delete UI is included in this prototype.

Reference implementations: [Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [pdf-lib](https://pdf-lib.js.org/), [ImageCapture.takePhoto](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto).
