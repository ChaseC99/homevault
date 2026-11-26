# Home Inventory App — Build Handoff

Read this file first, then look at `screens/` (layout reference) and `design-tokens.md` (visual style).

## 1. What we're building

A mobile app for a **professional home organizer**. The organizer visits client homes, photographs everything, and later sits with the client to attach receipts and details. The result is a **claim-ready PDF** the client can hand to their insurance agent after a flood, fire, earthquake or other loss.

- **User:** the organizer, and only the organizer. They manage many client properties.
- **Clients never use the app.** They only receive the PDF.
- **Must work fully offline.** Homes often have poor or no signal. Nothing in the app may require internet.

## 2. Product decisions (settled — do not change without asking)

| Decision | Detail |
|---|---|
| Properties are the top level | No "Client" grouping above properties. Client info lives on the property. |
| Offline-first, on-device only | All data, photos, receipt reading and PDF generation happen on the phone. No network calls are needed for any feature. Sync/backup is out of scope for v1. |
| Receipts are read automatically | When a receipt is scanned, extract **price, date, store** on-device (OCR) and pre-fill the fields. The organizer reviews/corrects. |
| Client gets the PDF only | No client accounts, logins or sharing portal. |
| No replacement cost | Do not collect or show replacement cost anywhere. The insurer handles it. Report shows purchase prices only. |
| Shoot now, sort later | The walkthrough camera does no naming or grouping. Photos are sorted into items afterwards (see §5). |

## 3. Platform

**Not decided yet — confirm with the owner before starting.** The owner has worked on both iOS and Android projects. Whatever is chosen, it must provide:

- Local database (e.g. SwiftData/Core Data/SQLite on iOS, Room/SQLite on Android, or SQLite in a cross-platform stack).
- Photos stored as files on device, referenced from the database. Keep full resolution (serial-number labels must stay legible); generate thumbnails.
- On-device text recognition for receipts (e.g. Apple Vision / VisionKit document scanner on iOS, ML Kit text recognition on Android — both work offline).
- On-device PDF generation, letter size (8.5×11 in).
- Share sheet for the PDF (AirDrop, print, Files, email when online).

## 4. Data model

```
Property
  id
  coverPhoto            (exterior photo; shown as the property's cover)
  name                  (e.g. "Nguyen residence")
  clientName, clientPhone, clientEmail
  address               (street, city, state, ZIP)
  insurer, policyNumber
  agentName, agentPhone
  walkthroughStartDate, walkthroughEndDate
  createdAt, updatedAt
  └── Room (many, ordered)
        id
        name            (e.g. "Bedroom 2", "Office")
        type            (Bedroom, Bathroom, Kitchen, Living Room, Dining Room,
                         Office, Family Room, Laundry, Garage, Basement, Closet,
                         Patio / Yard, Custom)
        roomPhotos[]    (wide overview shots, ordered)
        unsortedPhotos[] (item photos not yet assigned to an item, in capture order)
        └── Item (many, created during Sort)
              id
              photos[]  (1..N, ordered; first is the thumbnail)
              status    (needsDetails | complete)
              name
              category  (e.g. Furniture, Electronics, Appliance, Decor…)
              brand, model, serialNumber
              quantity  (default 1)
              purchasePrice (currency)
              purchaseDate
              store     ("where purchased")
              receipts[] (photo or PDF; plus extracted text/fields)
              condition (New | Good | Fair | Worn)
              notes
```

Photo: `id, filePath, thumbnailPath, capturedAt, width, height`.

Derived values (compute, don't store): item counts, "needs details" counts, room and property purchase totals, unsorted photo counts.

**Room naming rule:** when adding a room of a type that already exists, auto-number it. First Bedroom is "Bedroom" (or the user can rename it, e.g. "Primary Bedroom"); the next is "Bedroom 2", then "Bedroom 3", etc. Number = existing count of that type + 1.

## 5. Core workflow

1. **Set up** — create a property (cover photo + client/insurance info), add rooms.
2. **Walkthrough (in the home, fast, no typing)** — for each room: take room photos (wide shots), then switch to item photos and shoot everything. No naming, no grouping.
3. **Sort (later, anywhere)** — in each room, tap the unsorted photos that show the same thing → "Make item". Repeat until no unsorted photos remain. New items start as `needsDetails`.
4. **Details session (with the client and their receipts)** — go through the room's `needsDetails` items one at a time. Scan the receipt → price/date/store are pre-filled → fill brand, model/serial, quantity, condition → "Save & next item". Item becomes `complete`.
5. **Report** — generate the PDF for a property and share it.

## 6. Screens

Mockups are in `screens/` in this order. Sample names, prices and dates in them are placeholder data.

### 01 · Properties (home screen)
- Header: "Properties", count of active clients, a **"Works offline"** badge, **New property** button.
- Search field (client name or address).
- One card per property: large exterior cover photo, property name, total purchase value, address · room count · item count, and a status badge ("12 need details", or "Report ready" when nothing is outstanding).
- Bottom tab bar: **Properties** · center **camera** button (opens walkthrough camera) · **Reports**.

### 02 · Property
- Full-bleed exterior cover photo with Back and **Retake** buttons on top.
- Name, address, "Info" link (edit client/insurance info).
- Three stats: documented value, items, items needing details (highlighted).
- Rooms list with **+ Add rooms**. Each row: thumbnail (dashed placeholder if no photos yet), name, "18 items · 5 need details" / "all done" / "Not photographed yet".

### 03 · Add rooms
- Grid of room-type tiles, each showing how many already exist. Tapping a tile adds a room using the auto-numbering rule. Tap again to add another.
- "Or name your own" text field for custom rooms.
- List of rooms being added (removable chips). Primary button "Add N rooms".

### 04 · Walkthrough camera
- Full-screen camera. Top: Done, current room picker, "On phone" indicator.
- Big shutter. Below it a two-way switch: **Room · N** / **Items · N** (counts of photos taken in each mode).
- Strip of recent thumbnails. Hint text: room mode "Wide shots of the whole room"; items mode "Shoot every item. Sort them later."
- No naming, no item grouping, no extra prompts. Photos save immediately to the device.

### 05 · Sort photos
- Grid of the room's unsorted item photos in capture order. Tap to select (checkmark + border).
- Bottom bar: "N photos selected" + **Make item** (disabled when nothing selected). Creating an item removes those photos from the unsorted grid and shows the new item as a chip ("Item 1 · 3 photos").
- "N left to sort" counter.

### 06 · Room
- Back to property, **Capture** button (opens camera for this room).
- Room name, item count and running total.
- Room photos strip (4 thumbnails).
- Two action cards: **"23 photos to sort" → Sort** and **"5 items need details" → Start** (details session). Hide each when its count is 0.
- Items list, needs-details first, with a badge; complete items show brand/receipt status and price.

### 07 · Details session
- Header: Exit, room name, "Item 1 of 5 needing details", Skip. Progress bar.
- The item's photos, name field.
- Receipt card: scan state → "Read on this phone: price, date, store — check them", "+ Another" for multiple receipts.
- Fields: purchase price, date purchased, where purchased, quantity, brand, model/serial #.
- Condition: New / Good / Fair / Worn (single choice).
- Primary button **Save & next item**.

### 08 · Item record
- Photo viewer + thumbnails + add-photo tile.
- Name, category · room · property, status badge.
- Sections: **Purchase** (price, date, store, receipt with "View"), **Identification** (brand, model, serial #, quantity), **Condition & notes**.
- Edit opens the same form as the details session.

### 09 · Build report
- Property picker.
- Warning if items still need details ("They'll appear with photos only") with a link to finish.
- Include toggles: Cover page, Room photos, Item photos, Receipts appendix.
- **Generate PDF**. Notes: "made on this phone, no internet needed"; "Share by AirDrop or print anytime · email when you have signal".

### 10 · PDF page 1 — cover
- Title "Personal property inventory", property name, generated date.
- Exterior photo.
- Four blocks: Policyholder (name, phone, email), Insured property (address), Insurance (insurer, policy #, agent name + phone), Inventory taken (dates, prepared by organizer + business).
- Summary by room table: Room · Items · Purchase total, with a Total row.
- Footer: disclaimer line + "Page X of Y".

### 11 · PDF room pages
- One section per room (continues across pages): room name, item count, room total.
- Room photos row.
- Item table: Photo · Item (name + brand/model · condition) · Serial # · Qty · Purchased (date) · Price · Receipt (code like A-1, or "None").
- Receipts appendix at the end: one receipt per page, labelled with its code.

## 7. States to handle

- Property with no rooms; room with no photos ("Not photographed yet").
- Room with unsorted photos but no items; all photos sorted (hide Sort card).
- Item without receipt (show "None" in PDF, "No receipt" in app).
- Receipt OCR fails or is partial: leave fields empty, keep the image.
- Report generated while items need details: include them with photos and whatever fields exist.
- Low storage on device: warn before the camera starts.

## 8. Out of scope for v1

Cloud sync/backup, client logins, replacement-cost estimates, client grouping, multiple organizers sharing a property, automatic photo grouping (AI), video capture.

## 9. Suggested build order

1. Data model + local persistence + photo file storage.
2. Properties → Property → Add rooms.
3. Walkthrough camera (room/items modes).
4. Sort photos → items.
5. Details session + item record + receipt scan with on-device OCR.
6. PDF generation + share.
7. Offline audit: run the whole flow in airplane mode.
