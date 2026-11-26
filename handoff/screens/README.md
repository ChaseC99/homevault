# Screen mockups

These are the mockup sources from the design canvas, in flow order. Use them as a **layout and copy reference**, not as code to ship.

- Phone screens are 390×844 pt (item record is shown scrolled, 390×1180). PDF pages are 612×792 pt (US letter).
- Styles are inline, so sizes, colors and spacing can be read straight from each element.
- The files were made for a design tool. They load a `support.js` runtime that isn't included, so they won't render correctly if opened in a browser on their own.
  - `{{ ... }}` placeholders, `<sc-for>` / `<sc-if>` tags and the `class Component` script drive the clickable prototype. Treat them as repeated rows and conditional states.
- Grey boxes stand in for photos.
- All names, addresses, prices and dates are sample data.

| File | Screen |
|---|---|
| 01-properties.html | Properties (home) |
| 02-property.html | Property cover + rooms |
| 03-add-rooms.html | Add rooms (auto-numbered) |
| 04-walkthrough-camera.html | Walkthrough camera (room / items) |
| 05-sort-photos.html | Sort photos into items |
| 06-room.html | Room |
| 07-details-session.html | Details session with client + receipts |
| 08-item-record.html | Item record |
| 09-build-report.html | Build report |
| 10-pdf-cover-page.html | PDF cover page |
| 11-pdf-room-page.html | PDF room page |
