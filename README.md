# Jigsaw Homevault

A mobile-first, local-only PWA for a professional home organizer. The working flow is property setup → rooms → room overviews or item photography → photo labeling with item details and receipt review → US-letter PDF export.

## Run

Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. This is a static production preview; the server only delivers application files. Data, images, OCR, and reports stay in the browser. Use one consistent URL: `localhost`, `127.0.0.1`, different ports, and different HTTPS hosts each have separate storage.

For source development, use `npm run dev` (port 5173). Development mode intentionally does not install the offline worker. Validate offline use against the production build.

The repository includes the local OCR model, WASM engine, PDF worker, fonts, and app icons. `npm run assets` refreshes OCR/PDF assets after dependency updates. Run it before rebuilding if those packages change. Reports embed Inter and Space Grotesk under the SIL Open Font License; no runtime font downloads occur. `scripts/report-fonts.mjs` unpacks the installed Space Grotesk WOFF into TrueType for PDF embedding.

## Use on a phone

1. Serve `dist/` at a **trusted HTTPS URL**, using the same path configured when building (see GitHub Pages below). Any static HTTPS host or a locally trusted HTTPS development proxy works. The app has no backend or login. A plain `http://<computer-LAN-IP>:4173` address is not sufficient for service workers and live phone-camera access.
2. Open in Safari on iPhone, or a current Chromium browser on Android. Open **Organizer & device** and keep the app open until **Ready offline** appears there. The initial bundle is about 51 MB because it includes the English OCR model and all required reader assets.
3. iPhone: Share → Add to Home Screen. Android: use the browser's Install app action.
4. Launch from the installed icon; confirm offline readiness there before visiting a home. Turn on airplane mode and try importing a photo, reading a receipt, and generating a report.
5. Allow camera access when you enter either capture flow. If live capture is unavailable, the shutter opens the phone camera and Import photos is shown. More camera options also offers import, native capture, and retry. Live capture feature-detects `ImageCapture.takePhoto()`; More camera options identifies when the fallback uses video resolution. Serial-number readability, focus, and iPhone-specific quality still need hands-on hardware testing.

Settings shows the running app’s release version, build ID, and build time. **Check for updates** shows **Checking**, **Downloading**, **Update available → Restart**, **You’re up to date**, or **Check failed → Retry**. An offline or failed check does not claim the app is current. Restart saves any organizer edits first; a failed save leaves them on screen and prevents the restart. The version display changes only after loading the new app, not when its download finishes.

Updates also download in the background while online, with checks on launch, when returning to the app, and through **Check offline readiness** in Settings. Offline readiness describes the currently cached version and is separate from update status. Once a full update is downloaded, **Update available → Restart** also appears on Properties and property or room pages. Restart reloads the same page with the new version and preserves saved inventory and photos; other open windows are not automatically reloaded. If you skip Restart, closing all Homevault tabs/windows still lets the update activate. Installations predating these controls need that manual close/reopen once to receive them.

## GitHub Pages

The deployment workflow is `.github/workflows/deploy.yml`. For `ChaseC99/homevault`, the default site address is **https://chasec99.github.io/homevault/**.

1. Push this project, including `public/`, `package-lock.json`, and `.github/`, to the repository's `main` branch. The bundled OCR model, WASM files, PDF assets, icons, and report fonts are required; generated `dist/` and `node_modules/` stay out of Git.
2. In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow** if the initial push happened before Pages was enabled. Subsequent pushes to `main` build and deploy automatically.

The workflow uses Node 24, installs the locked dependencies, refreshes bundled OCR/PDF assets, builds the production app, and uploads only `dist/` for deployment. Tests run locally only; GitHub Actions does not run tests or install browsers. It reads the actual site path from GitHub Pages, so another repository name or a configured custom domain does not require editing source paths. If your default branch is not `main`, update the workflow trigger. No deployment secrets or personal access token are needed.

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

After deployment, confirm **Ready offline** in **Organizer & device**, install on a phone, then test offline reload, camera capture, receipt OCR, PDF export/sharing, and **Update available → Restart** after the next release. Inventories on localhost remain on localhost: deploying does not migrate browser storage or provide backup/sync.

## Workflow

- **Properties:** create the home with client contact information, an exterior photo, and walkthrough dates. Insurance fields are omitted from both setup and editing. Add an exterior photo directly from the empty cover on the property page; change it later from Edit property. Address entry supports the browser’s saved-address autofill. Add current location saves GPS coordinates and accuracy separately from the street address, after browser permission. **Open in Maps** opens that precise saved location in Apple Maps without displaying raw coordinates. No address lookup runs in Homevault. Search by property, client, or address.
- **Rooms:** tap preset types repeatedly for automatic numbering, or add a custom room. Pending rooms remain visible in a sticky tray with the save action. Rename rooms later. Back navigation stays at the top while scrolling throughout the app.
- **Deletion:** the property and room **…** menus offer Delete. A confirmation names the record and explains what will be removed. Deletion removes its child records and referenced photos/receipts in one transaction, while preserving files still used elsewhere. Cancelling or a storage failure leaves the inventory intact.
- **Room overview:** tap the **+** tile beside the overview thumbnails to photograph the room. The first overview is the room cover; open another overview and choose **Make room cover** to change it. The room page shows a cover hero, an overview card, and live item counts and documented totals. **Label** opens the unlabeled photo grid; Search the item list, then use the filter sheet for category and review status. The adjacent sort sheet offers name, per-unit price, quantity, and unreviewed-first ordering; missing prices appear last. The live item count sits beside the Items heading. Tap an item to open its editable fields directly. Use **Add Item** beside the Items heading, the bottom camera, or **Add items** in the room menu to photograph more items. Rename or delete the room through its **…** menu.
- **Camera shortcuts:** on a room page, the tab-bar camera opens item capture for that room and displays its name. On a property page, it preselects the property and asks for a room. Elsewhere, it opens the property/room chooser. Choosing a room opens the camera directly; changing property clears the room selection.
- **Item capture:** choose Add items and take all the photos for the room. Each photo saves immediately to the room’s unsorted photos; no item record is created until you tap a photo to label it (or group selected photos). Done opens **Label photos**. The camera keeps the room name, shutter, thumbnail count, and a large bottom-right checkmark labeled Done visible; capture instructions and the duplicate labeling action are omitted. Tap the compact zoom value to reveal its slider; taking a photo collapses the slider while keeping the zoom setting. Live capture uses camera zoom when exposed by the browser, otherwise a digital crop that is also applied to the saved image. Native-camera capture uses the phone camera’s own controls. Tap the latest thumbnail to review it.
- **Import and persistence:** More camera options contains import and native-camera actions. Each photo and its record save in one transaction. Imports save sequentially; if one fails, the saved count is shown and remaining files can be retried. Unsorted photos survive reloads.
- **Label photos:** tap one photo to open its name and complete item details together. A draft item is saved immediately, edits autosave, and **Save & return to photos** returns to the grid while photos remain. Saving the final item returns directly to the room with an **All photos are labeled** toast. Adding the last photos to an existing item also returns to the room automatically. Blank names and unknown details are allowed. Saved item cards reopen the same editor. **Select photos** is a secondary mode for grouping photos of the same item, using **Add to item** without opening an existing item, or moving room overviews. **Undo photo change** restores capture order and retains entered details and receipts; only an empty untouched draft is removed.
- **Editable items:** opening an item from its room immediately shows editable fields, with **Save & return to room** and a saving Back action. The same editor provides name, category, receipt attachment and scanning, per-unit price, quantity, date, store, brand, model, serial scanning, condition, and notes. The **+** tile beside the photo strip imports more item photos; **Choose additional room photos** attaches photos already captured in the room. Open an item photo and choose **Make Cover** to use it as the first photo. **Move to another room** saves pending edits and moves the item, photos, and receipts together to another room in the same property. Photo removal has Undo, and details survive removal of the last photo.
- **Drafts and review:** valid edits autosave. Save and in-app navigation keep the editor open after validation or storage failures; repeated taps cannot duplicate items. Browser Back also saves before leaving. Check **Reviewed** deliberately after checking available information; missing names, dates, prices, condition, or receipts are allowed. Editing a field clears its review flag. Focus an empty category field to see tappable suggestion pills for Furniture, Electronics, Art, Decor, Appliances, Jewelry, and saved custom categories. Typing filters the pills and offers a **+ Add** action for a new category. Serial scans run on-device and require review before applying.
- **Receipts:** **Take receipt photo** opens the phone camera; **Choose image or PDF** selects an existing file. Both attach the original and read it automatically. English on-device OCR suggests store/date, leaves unrecognized fields blank, and preserves the original and recognized text even when reading is partial or fails. Confirm whether a detected receipt total is the price of one unit or all units of this item before applying it; division is offered only for quantities above one. Receipts with multiple purchases need manual correction. Date parsing supports US numeric, ISO, and English month-name dates, including common spacing and OCR digit errors. Store suggestions remove common edge noise. Images and PDFs preview inside the app, with page navigation for PDFs and an optional original download.
- **Reports:** choose the property and include options. US-letter reports use MM-DD-YYYY dates, a three-column homeowner/address/inventory cover, and room tables followed immediately by each item's pages in table order. Each item starts with a 4:3 photo slot and purchase, identification, and condition/notes columns. Remaining photos and receipts follow two per page, paired by orientation; every PDF receipt page is included. There is no receipts appendix. Unreviewed records keep their photos and recorded fields, with dashes for missing details. Unassigned photos follow their room's items, are excluded from counts/totals, and are included when item photos are enabled. Download, open/print, or use the native share sheet when supported.
- **Organizer & device:** business details used by reports, offline readiness, approximate storage usage, and a request for persistent storage.

## Product decisions

- PWA prototype now; native Swift implementation later. The original undecided-platform statement in `handoff/HANDOFF.md` is superseded by this decision.
- Room overviews and item photography are separate flows. Item photos are captured first and labeled individually afterwards, with optional grouping; existing item records and photos remain compatible.
- Properties are top-level. There are no client accounts, client grouping, shared organizers, cloud sync, backup service, or login.
- Purchase price is **per unit**, in USD. All monetary totals use integer cents × quantity. Unknown prices are excluded and distinguished from a recorded zero. Receipt totals are never automatically multiplied again. Dividing a receipt total rounds the per-unit price to cents and says so.
- Captured images/PDFs are kept as IndexedDB blobs alongside thumbnail blobs and metadata. This is the browser equivalent of local file storage, not a server upload. Full-resolution report exports embed original JPEG/PNG pixels without cropping or lossy recompression, apply camera orientation when drawing, and reuse embedded assets across thumbnails and item pages. Other browser-decodable image formats convert losslessly to PNG at original dimensions. PDF receipts retain their original page content, including vector text and embedded images. Receipt text inside original evidence is preserved as captured; report-generated date fields use MM-DD-YYYY.
- IndexedDB commits metadata and imported assets in one transaction. Failed writes do not replace prior records. The application does not claim that browser storage is permanent. Clear-site-data, uninstall behavior, private browsing, device loss, and browser eviction can remove records. PDFs are exported records, not restorable backups.
- Missing receipts are normal. OCR is assistance for human review, not authoritative extraction. There are no fabricated prices or mock OCR outputs.
- No replacement cost, video capture, AI photo grouping, cloud OCR, or runtime CDN requests. Address autofill is supplied by the browser; global address autocomplete and reverse geocoding are not enabled. GPS coordinates stay stored locally and do not replace a street address; opening Maps sends the saved coordinates to the map destination.

## Validation

Run tests locally before pushing to `main`:

```sh
npm test
npm run build
npm run test:e2e
```

The browser suite uses generated, clearly synthetic fixtures in `tests/fixtures/` and an isolated browser profile. It does not access a real camera or personal browser data. The runner starts its own production preview; stop any existing preview on port 4173 or set `PLAYWRIGHT_PORT` to a free port. On macOS it uses installed Chrome; otherwise install a local browser once with `npx playwright install chromium`. See `playwright.config.ts` for browser overrides.

`tests/model.test.ts` covers domain rules, receipt parsing, and atomic storage. Browser coverage is grouped into inventory setup/navigation/deletion, photo labeling/editing, camera/OCR/PDF workflows, and offline installation/updates. Shared setup and storage helpers live in `tests/e2e/helpers.ts`. Use `npm run test:e2e -- tests/e2e/sorting.spec.ts` for a focused local run. Exact spacing/color checks and duplicate journeys are omitted; device layout and camera quality still need hands-on review.

The exported sample PDF is written to `artifacts/`. Playwright saves failure screenshots/traces in `test-results/` and its HTML report in `playwright-report/`. `VALIDATION.md` records completed checks and remaining device-specific limits.

## Source map

- `src/lib/model.ts`: domain rules, per-unit currency, grouping, and derived status/totals.
- `src/lib/db.ts`: atomic IndexedDB storage and storage-error handling.
- `src/lib/media.ts`: original/thumbnail image handling.
- `src/lib/ocr.ts`, `receipt-parser.ts`, `pdf-input.ts`: local receipt reading.
- `src/lib/report.ts`: local PDF layout and pagination.
- `src/components/`: capture, setup, labeling, editable items, in-app receipt previews, and report workflows.
- `scripts/build-sw.mjs`: versioned, complete static precache with readiness verification.
- `handoff/`: unchanged design references and original product handoff.

## Known prototype limits

English OCR and US date/currency conventions; OCR can misread stores, totals, and dates. Browser-decodable images (JPEG/PNG/WebP, plus HEIC where the browser supports it) are required. Unsupported files show a recoverable error. Encrypted/damaged receipt PDFs require replacement or exclusion from the appendix. Complex PDFs and very large inventories may take time or hit mobile memory limits. The bundled report font covers Latin, Greek and Cyrillic; additional scripts may need another local font. No backup/restore is included in this prototype. Confirmed property and room deletion is permanent.

Reference implementations: [Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [pdf-lib](https://pdf-lib.js.org/), [ImageCapture.takePhoto](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto).
