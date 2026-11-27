# Prototype validation — November 26, 2026

The implementation is complete for the agreed PWA prototype scope. The production preview is served at `http://127.0.0.1:4173` while the local preview process is running.

## Claim-ready PDF layout and original images

Passed **31 unit/integration tests**, the production build, strict TypeScript checks for the changed tests, formatting, and diff checks. The targeted Chromium offline workflow passes with real receipt OCR, the renamed Receipts control, and a downloaded report while networking is disabled.

- Cover, room tables, and item pages follow screens 10–12b: US letter, 40 pt vertical and 48 pt horizontal margins, MM-DD-YYYY report dates, three cover columns, no printed insurance block, no receipt appendix, and page-specific footers. Insurance fields remain in the model.
- Tested landscape, single portrait, two portraits, portrait plus receipt, mixed continuation pages, and a single remaining image. Every item follows its room table in table order; PDF receipt pages follow remaining capture-order photos. Drafts retain their photos and missing fields use dashes. Long notes continue without being discarded or overlapping footers.
- PDF inspection verifies all page dimensions and text bounds, original 3200 × 2400 JPEG dimensions and byte-for-byte payloads, reuse of image objects, and embedded PDF receipt page forms. Rotated camera JPEGs, rotated/blank receipt PDF pages, table pagination, and excluded photo/receipt options are covered.
- Poppler renders of all 16 pages in `artifacts/report-layouts.pdf` were visually inspected, along with the camera/PDF rotation examples in `artifacts/report-orientation.pdf`. Full-size item and receipt pages confirm mats, equal-height portrait pairs, uncropped images, Space Grotesk headings, monospace serials, and wrapped notes. These files contain synthetic data.

## Labeling completion and room heading

Passed **27 unit/integration tests**, the production build, and all **21 Chromium browser scenarios**, plus strict TypeScript, formatting, and diff checks.

- The final item stays editable until Save or Back succeeds. Completing labeling then replaces the empty grid with the room and shows **All photos are labeled** as a toast. There is no completion screen or extra Back to room step.
- Adding the last photos to an existing item also returns automatically. Moving the last photos to room overviews returns with **Room overview photos saved**. Completion toasts survive navigation and do not reappear on reload.
- A simulated failed final save keeps the editor and entered name available for retry. Coverage includes grouping all remaining photos, adding the last photo to an existing item, moving the last overview, and the single-photo receipt workflow.
- Removed Start details and the separate count row. The live count appears beside Items, including a filtered count such as **5 of 6**.

## Room, property, item, and camera controls

Passed **27 unit/integration tests**, the production build, and all **20 Chromium browser scenarios**. The two affected item scenarios also passed again after the final move-sheet validation-message adjustment. Strict TypeScript checks for the application and browser tests, formatting checks, and `git diff --check` passed.

- Rooms have Add Item, text search, category/review filters, and name, per-unit price, and quantity sorting in both directions. Unknown prices sort last. Browser checks combine search and filters, clear empty results, and verify each sort order.
- The empty property cover imports an image directly and retains it after reload.
- The category field uses tappable suggestion pills instead of a datalist, opens all suggestions when empty, supports keyboard selection, and offers a plus action for custom categories. Item photos have an adjacent add tile and a Make Cover action inside the viewer. Receipt choices explicitly distinguish taking a photo from selecting an existing image/PDF; both still run the real on-device reader.
- Moving an item saves the current draft and moves its photo/receipt references in the same transaction. Invalid quantities and storage failures leave it in its original room and show the error in the move sheet. A property without another room offers Add room and preserves validation behavior.
- Visually inspected 390 px room/item/filter/sort views, the 320 px property/editor views, and portrait/landscape camera controls. The bottom-right Done checkmark stays within the viewport. Screenshots use synthetic records and live in `artifacts/round2-*.png`.
- WebKit touch selection, narrow layout, sheets, and camera layout passed with text-only fixtures. The full WebKit browser run could not complete: direct IndexedDB image-fixture writes and imports fail with `UnknownError: Error preparing Blob/File data to be stored in object store` in the bundled WebKit runtime. The existing Maps-popup check also timed out there. WebKit screenshots therefore show photo placeholders; Chromium screenshots and tests use actual synthetic image blobs. Physical iPhone Safari image storage and the native keyboard/camera still need hardware verification.

The build retains its existing large-bundle warning. No deployment was performed.

## Settings update checks and version display

Passed **27 unit/integration tests**, the production build at `/homevault/`, and all **19 Chromium scenarios** (18 in the full run, then the offline OCR/PDF workflow after narrowing its saved-message locator for the additional update status).

- Settings shows the release version, build commit, and build time embedded in the running app. Local changes are marked `-modified`; GitHub builds use the deployed commit SHA.
- Check for updates reports checking, downloading, current, ready to restart, and failure/retry states. The two-release server fixture holds the update script and asset download separately to verify the progress states. Offline checks and failed downloads cannot report the app as current; retry can recover.
- The displayed build remains old until Restart. Restart preserves inventory and original-photo bytes, works offline after downloading, and saves edited organizer information first. A simulated storage failure keeps the organizer draft and old version on screen until retry succeeds. Other open editing windows are not automatically reloaded.
- The Settings version and update card were checked at 320 px. Installed phone behavior still needs hardware verification.

## Local test consolidation

Tests run locally only. GitHub Actions installs dependencies, refreshes bundled assets, builds, and deploys Pages; it does not install browsers or execute tests. The older CI descriptions below are historical.

Consolidated 27 browser scenarios in six files into 18 scenarios in four files, with shared creation, import, inventory-reading, and storage-failure helpers. Removed duplicate grouping, editing, navigation, and quota-failure journeys, exact spacing/color checks, and screenshots that were never compared. Kept persistence/rollback, destructive-action confirmation, OCR and receipt previews, PDF export, camera failure/retry, deployment paths, offline cache repair, and update recovery. The unit suite has 27 cases after merging the empty-inventory readiness assertion into the existing readiness test.

Local verification passed: 27 unit/integration tests, the production build with `BASE_PATH=/homevault/`, and all 18 retained Chromium scenarios at that subpath (16 in the full run, then the two corrected receipt/PDF scenarios in a targeted rerun). Test sources also passed strict TypeScript checking and formatting checks. Physical-device limits below still apply. The build retains its existing large-bundle warning.

## Room design revision

Integrated the photo-labeling revision (`9a630b1`) before verifying this layout. Passed **28 unit/integration tests**, the strict TypeScript/production build, and **27 Chromium browser scenarios**. After the final CSS adjustment to the wide-screen callout, rebuilt and reran all **8 room-layout scenarios** successfully.

- Compared the rendered room page with the supplied design: a cover/neutral hero with white navigation and dark lower gradient; a white Room overview card with photo count, cover marker and add tile; Items totals, an unlabeled-photo stack and Label action; All/Needs details filters and Start details; and one rounded item list. Production content comes from stored inventory.
- Verified filter selection with keyboard input, live counts and exact cents/quantity totals after editing and labeling, and reviewed-item status. Item rows enter the always-editable editor, Start details opens the existing review session, and labeling Save returns to the grid without advancing. Existing Add to item/Add item photos and full-precision Maps behavior pass the combined suite.
- Verified empty rooms, no overview cover, no unlabeled photos, no items needing details, long room/item names, and items without photos. Layout and navigation checks pass at 320, 390, 768 and 1024 px without horizontal overflow. Cover changes, overview reclassification, rename/deletion, contextual camera controls and photo-viewer scroll restoration remain functional.
- Visually inspected the empty and populated mobile views and the 320/1024 px layouts. Screenshots: `artifacts/room-reference-empty.png`, `artifacts/room-reference-populated.png`, and `artifacts/room-design-{320,390,768,1024}.png`. Images and records in these artifacts are synthetic browser-test fixtures.

No deployment or default-branch merge was performed. The existing large-bundle build warning remains; physical iPhone/Android camera, storage and native Maps handoff are not verified by these browser checks.

## Photo labeling, editable items, and saved location revision

Verified with **28 unit/integration tests**, the strict TypeScript/production build, and **25 Chromium browser scenarios**. The browser suite uses the production build on an isolated local port and synthetic photos, receipts, serial labels, and locations.

- Tapping one photo opens its name and all item fields in the shared editor. Save returns to the photo grid, with no next-photo navigation. Blank names and unknown details save successfully; draft edits survive reload.
- Ordinary room item links open editable fields immediately, without an Edit action. Save and Back return to the room; existing detail-review sessions still support Skip and explicit next-item actions.
- Secondary selection supports grouping, adding photos to an existing item without opening it, and room-overview corrections. The editor imports additional photos, attaches existing room photos, changes the first photo, returns photos to the grid, and removes/restores photos. Undo retains recorded details and does not restore stale reviewed status after subsequent edits.
- Repeated photo/save taps cannot duplicate records. Failed creation keeps the original unassigned photos. Validation and storage failures retain the editor and draft for retry. Browser Back and app navigation flush drafts before leaving and remain on the editor after failed writes.
- Receipt image/PDF OCR, serial scanning, receipt previews, offline reload, capture failures, report generation, property/room deletion, and downloaded updates all remain covered by the full browser suite. Restart notices are hidden on the now-editable item pages.
- The 320 px editor keeps the name input above the sticky Save action without horizontal overflow. Inspected `artifacts/label-editor-320.png` and `artifacts/label-grid-320.png`.
- Both saved-location displays use **Open in Maps**. The browser test verifies the full-precision coordinate parameter, encoded URL, new-window destination, reload persistence, and removal. The destination is intercepted during the test; native Maps handoff still needs a physical-device check. The link follows Apple's [unified Maps URL format](https://developer.apple.com/documentation/mapkit/unified-map-urls).

No persistent schema or existing route was renamed. Native camera behavior, physical Safari storage, and the other device limits below remain unchanged. The production build retains its existing large-bundle warning.

## App update revision

Verified against the layout and deletion revision with **28 unit/integration tests**, the production build, and **22 Chromium browser scenarios**.

Update checks run on launch, resume, and manual offline checks. A real two-release HTTP fixture verifies that the restart notice waits for a complete download, survives reload while the update waits, and activates/reloads the same route offline after Restart. Saved inventory and original-photo hashes are unchanged. Failed downloads retain the old version, and a later manual check can recover. Restarting one window leaves an unfinished form in another window intact; that window can restart after leaving the form. The notice was inspected at 320 px (`artifacts/update-notice-320.png`). Installed iPhone resume/update behavior remains a physical-device check.

## Layout and deletion revision

Verified the isolated commit contents with **28 unit/integration tests**, the production build, and **20 Chromium scenarios**. Two targeted WebKit scenarios pass for mobile date layout/persistence and contextual navigation.

- Property setup and editing omit insurance. The property cover picker lives in Edit property, and saved covers survive reload.
- Date inputs stay inside the card padding at 320, 390, 540, and 768 px. WebKit with a mobile viewport also verifies the date layout, persistence, and contextual camera navigation. Native date-picker interaction still needs a physical phone check.
- Room overview, tasks, Items, and hero text share the same page gutters. Related property, setup, item, sorting, and report pages are checked for horizontal overflow at 320 px. Items has an Add items action; the explanatory sorting label is removed.
- Fullscreen photo viewers lock the underlying page, restore its scroll position, and restore the white browser theme on close. The regular and scrolled navigation bars use opaque white backgrounds.
- Property and room menus offer Delete with a confirmation naming the record and its contents. Tests cover Cancel/Escape, rollback after a failed save, deletion across reload, child records and photo/receipt cleanup, preservation of other properties, and preservation of shared assets.
- The local Playwright WebKit build rejects Blob/File writes to IndexedDB, including direct fixture writes independent of the app. This blocks its photo-storage scenarios; Chromium covers those flows. This is separate from the passing WebKit date and navigation checks. Physical Safari photo storage remains unverified in this revision.

Screenshots: `artifacts/edit-dates-contained.png`, `artifacts/room-spacing-mobile.png`, and `artifacts/delete-property-confirmation.png`.

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
