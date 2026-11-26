# Prototype validation — November 26, 2026

The implementation is complete for the agreed PWA prototype scope. The production preview is served at `http://127.0.0.1:4173` while the local preview process is running.

## Feedback revision checks

The feedback revision passes **25 unit/integration tests**, the strict TypeScript/production build, and **16 Chromium browser scenarios** (`npm test`, `npm run build`, `npm run test:e2e`). The browser suite uses synthetic images, serial labels, coordinates, and camera streams in an isolated profile.

- The room page matches the updated empty and populated references: overview cover header, compact thumbnail strip with a cover marker and add tile, combined sorting/details card, and compact item rows. Cover changes survive reload, room renaming updates the camera label, and back navigation remains visible at 320 px while scrolling.
- Camera navigation is checked with two properties: the property shortcut preselects the correct property across reload; switching property clears the room; Continue opens capture directly; and a room shortcut opens its own camera. Home omits the count/status line, and blank addresses are omitted. Offline status remains available in Settings.
- Add-property omits insurance fields, offers browser address autofill and local GPS capture, and preserves manual address entry after location permission is denied. GPS is stored separately, survives reload, and can be removed. No geocoding service or API key is used.
- At 320 × 568, walkthrough dates do not overlap; the top navigation remains visible while scrolling; pending rooms remain in the bottom tray and can be removed before saving. Stale success messages clear on navigation so they do not obscure the tray.
- Item capture saves to the room’s unsorted photos immediately. Done opens sorting; item records appear only after grouping. Reload, partial import failures, duplicate shutter taps, grouping/undo, and separate overview photos are covered.
- Grouping opens a naming sheet with the selected thumbnails, Create item, and Name later. Named groups and numbered unnamed groups display a thumbnail, name, and photo count. Add name updates a skipped group without leaving sorting. Tests verify cancellation preserves selection, duplicate taps create only one record, quota errors preserve the name draft and original photos for retry, and appending/undo preserves names, capture order, and review status. Names and group counts survive reload. The sheet and group cards were inspected at 320 px; actual phone keyboard behavior still needs hardware verification.
- The camera now has one Done action, a room title, shutter, and thumbnail count. The large count heading, duplicate sorting button, and instruction footer are removed; routine save messages are announced to screen readers while failures remain visible. Compact zoom controls fit at 320 × 568 and 844 × 390; their slider is collapsed by default, expands on demand, and collapses after capture without resetting zoom. A synthetic camera confirms digital 2× zoom produces a saved crop with half the original width and height. Camera tracks stop on exit. Browser-exposed hardware zoom still requires physical-device verification.
- Category suggestions include the six presets and saved custom values. Photo removal and Undo preserve photo order; removal and custom categories survive save/reload.
- A synthetic serial label passes through the real bundled OCR engine and the review/apply step. Receipt OCR still reads the sample image and two-page PDF offline. Parsing covers additional date formats, impossible dates, and merchant edge noise. Quantity one has no divide action.
- Receipt images and PDFs preview inside the app, including navigating to the second PDF page. Missing item fields display a dash. Offline report export and deployment-path asset checks still pass, without external application requests in the full offline workflow.

Additional screenshots: `artifacts/room-reference-empty.png`, `artifacts/room-reference-populated.png`, `artifacts/setup-dates-320.png`, `artifacts/pending-rooms-320.png`, `artifacts/sort-name-mobile.png`, `artifacts/sort-name-320.png`, `artifacts/sort-groups-320.png`, and the refreshed camera/item screenshots below. The source receipt that prompted the OCR feedback was not provided; its exact output has not been retested. Real phone camera quality, browser autofill behavior, and permission UX remain hardware checks.

## Earlier prototype checks (before this revision)

- **Production build:** TypeScript strict checking and Vite build pass. The generated service worker caches every runtime asset, including OCR workers/model, PDF tools and fonts. No runtime CDN or cloud service is used.
- **Unit/integration tests: 11 passed.** Per-unit money/quantity, unknown vs zero price, readiness with unassigned photos, room numbering, grouping order, direct item capture and room isolation, receipt parsing, original-blob persistence, transaction rollback and simultaneous writes.
- **Isolated Chromium browser scenarios: 8 passed.** Tests use synthetic fixtures and a temporary browser profile, not real client information or a real camera.
  1. Wait for offline readiness, disable all browser networking, reload, save organizer details, create property/client/insurance information and exterior cover, add numbered rooms, import room overviews separately from grouped item photos, reclassify an overview, read an image receipt and a two-page PDF with the real local OCR engine, correct a $760 receipt to $380 per unit × 2, review/save/reload, and download the real PDF while still offline. No external application requests or uncaught page errors were observed.
  2. Read a blank receipt, preserve it, leave unknown fields blank, retain the draft, and simulate an IndexedDB quota failure. The UI reports the failed save and the prior record remains unchanged.
  3. Skip two draft items and verify both retain their details, remain unreviewed, and the session ends without cycling back.
  4. Remove the cached OCR model in the isolated profile, verify readiness is withdrawn while offline, reconnect and verify the model is repaired and readiness restored.
  5. Use a synthetic live-camera stream to capture multiple angles, reject rapid duplicate shutter taps, undo a split, review the latest original, continue with a second item, exit with a pending empty group, reload and confirm all photos and groups. Verify camera tracks stop on exit and the global camera entry selects the room first. Exercise the video-frame fallback. Controls remain visible without scrolling at 320 × 568 and 844 × 390.
  6. Simulate a failed first capture and verify no item is created. Import a valid photo followed by a corrupted image, verify only the committed photo remains, then retry into the same group.
  7. Move overview photos into the existing sorting flow, group them and undo without leaving an item behind.
  8. Verify installation asset URLs and offline navigation respect the configured deployment path.
- **Rendered app:** inspected desktop and 390 px mobile layouts. Browser UI checks also confirmed property creation and automatic room numbering. Inspected the new room actions and minimal camera overlay in portrait and landscape; overview and item capture are separate, and old room-save notifications no longer cover the camera controls.
- **PDF verification:** generated an eight-page US-letter report with cover image, organizer/client/insurance information, room and item pages, unassigned-photo warning, an image receipt and both pages of the PDF receipt. Text extraction verifies names, notes, serial number, $380 unit price and $760 total; $1,520 is absent. Every page is 612 × 792 points, and text bounds stay within the page margins. Poppler and MuPDF renders were inspected. Full font embedding fixes the missing-glyph issue discovered during visual review.
- **Dependency audit:** zero known vulnerabilities after updating the PDF reader to its patched release.

## Earlier GitHub Pages readiness

- Built with `BASE_PATH=/homevault/` and passed all **11 unit/integration tests** and **8 Chromium browser scenarios** in an isolated copy, including offline image/PDF OCR and report export. The separate copy prevented concurrent local builds from replacing the deployment-path build during tests.
- Built with the default `/` base and passed the installation/offline deployment scenario there as well.
- Verified manifest launch/scope, app icons, service-worker scope, and all precached URLs stay within the deployment path. An old app cache is removed on activation while a neighboring app's cache is preserved. Offline hash-route navigation and reload both work.
- The GitHub Actions workflow parses as YAML and builds/tests before uploading `dist/`. It derives `BASE_PATH` from Pages configuration. These results cover local validation; GitHub-hosted execution and the live HTTPS site are checked separately after pushing.

## Useful artifacts

- `artifacts/validated-inventory.pdf` — sample report made from clearly synthetic test inputs.
- `artifacts/report-text.txt` — extracted report text.
- `artifacts/report-preview-1.png`, `report-preview-2.png`, `report-preview-3.png` — inspected report renders.
- `artifacts/home-mobile.png`, `property-mobile.png`, `item-mobile.png`, `report-mobile.png` — browser screenshots.
- `artifacts/build.log` — original production build output.
- `artifacts/camera-build.log` — successful production build after the camera redesign.
- `artifacts/room-capture-actions-mobile.png`, `item-camera-mobile.png`, `overview-camera-mobile.png`, `item-camera-320.png`, `item-camera-844.png` — new capture-flow screenshots (synthetic camera imagery).

## Verification limits

Real iPhone/Android installation, native share-sheet behavior, permission prompts, lens choice, autofocus, full-sensor photo resolution and serial-number readability still need hands-on hardware testing, as agreed. The in-app browser's file-chooser automation stalled; the isolated browser suite completed the file-import, OCR, PDF and offline checks without that dependency.

Offline behavior was verified in Chromium after a completed first load. Actual browser storage remains device- and browser-managed; persistence requests cannot guarantee protection from uninstall, clear-site-data, device loss or every eviction scenario. Very large inventories and complex PDFs have not been stress-tested on phone hardware. OCR uses English with US numeric, ISO, and English month-name dates and always needs human review.

The report contains real recorded fields from the test inputs, including partial data. It is not a guarantee of insurer acceptance or a backup/restore format. No cloud backup, sync, permanent-delete interface or client portal is included.
