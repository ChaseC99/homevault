import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { type Inventory, type Property, type Item, stats, itemTotal, money, title } from './model';
import { getAsset } from './db';
import { imageBlob } from './media';
import { renderPdfPages } from './pdf-input';
import { assetUrl } from './asset-url';
export interface ReportOptions {
  cover: boolean;
  roomPhotos: boolean;
  itemPhotos: boolean;
  receipts: boolean;
}
const ink = rgb(0.106, 0.102, 0.09),
  green = rgb(0.18, 0.37, 0.306),
  muted = rgb(0.37, 0.36, 0.33),
  line = rgb(0.89, 0.87, 0.84);
const readable = (value: unknown) => String(value ?? '').trim() || 'Not recorded';
export async function generateReport(
  data: Inventory,
  property: Property,
  options: ReportOptions,
  progress: (text: string) => void = () => {},
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const loadFont = async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw Error('Report font unavailable. Finish offline setup and try again.');
    return response.arrayBuffer();
  };
  // Embed complete static fonts: subsetting these Inter outlines drops glyphs in PDF renderers.
  const font = await doc.embedFont(await loadFont(assetUrl('fonts/report-regular.ttf')), {
      subset: false,
    }),
    bold = await doc.embedFont(await loadFont(assetUrl('fonts/report-semibold.ttf')), {
      subset: false,
    });
  const s = stats(data, property.id);
  let page!: PDFPage,
    y = 48;
  const receiptCodes = new Map<string, string>();
  let rn = 0;
  s.items.forEach((i) => i.receipts.forEach((r) => receiptCodes.set(r.id, `A-${++rn}`)));
  const safe = (v: unknown) =>
    String(v ?? '')
      .replace(/\r/g, '')
      .replace(/\t/g, '  ');
  function wrap(value: unknown, width: number, size = 10, f: PDFFont = font) {
    const text = safe(value),
      out: string[] = [];
    for (const paragraph of text.split('\n')) {
      let row = '';
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        let remaining = word;
        while (f.widthOfTextAtSize(remaining, size) > width) {
          if (row) {
            out.push(row);
            row = '';
          }
          let cut = 1;
          while (
            cut < remaining.length &&
            f.widthOfTextAtSize(remaining.slice(0, cut + 1), size) <= width
          )
            cut++;
          out.push(remaining.slice(0, cut));
          remaining = remaining.slice(cut);
        }
        const candidate = row ? `${row} ${remaining}` : remaining;
        if (f.widthOfTextAtSize(candidate, size) > width) {
          out.push(row);
          row = remaining;
        } else row = candidate;
      }
      out.push(row);
    }
    return out;
  }
  function text(value: unknown, x: number, top: number, size = 10, f: PDFFont = font, color = ink) {
    page.drawText(safe(value), { x, y: 792 - top - size, size, font: f, color });
  }
  function rule(top: number) {
    page.drawLine({
      start: { x: 48, y: 792 - top },
      end: { x: 564, y: 792 - top },
      color: line,
      thickness: 0.7,
    });
  }
  function newPage(label = 'Personal property inventory') {
    page = doc.addPage([612, 792]);
    y = 48;
    text('JIGSAW HOMEVAULT', 48, 24, 8, bold, green);
    for (const row of wrap(label, 516, 18, bold)) {
      text(row, 48, y, 18, bold);
      y += 24;
    }
    y += 8;
    rule(y);
    y += 16;
  }
  function ensure(height: number, label = 'Inventory · continued') {
    if (y + height > 724) newPage(label);
  }
  function paragraph(
    value: unknown,
    { size = 10, color = ink, bolded = false, width = 516, x = 48, gap = 10 } = {},
  ) {
    const f = bolded ? bold : font;
    for (const row of wrap(value, width, size, f)) {
      ensure(size + 5);
      text(row, x, y, size, f, color);
      y += size + 5;
    }
    y += gap;
  }
  function field(label: string, value: unknown) {
    ensure(45);
    paragraph(label.toUpperCase(), { size: 8, color: muted, bolded: true, gap: 1 });
    paragraph(readable(value), { gap: 10 });
  }
  async function photo(assetId: string, x: number, top: number, w: number, h: number) {
    const asset = await getAsset(assetId);
    if (!asset)
      throw Error('A photo is missing from device storage. Check the item before exporting.');
    const converted = await imageBlob(asset.original, 2200);
    const image = await doc.embedJpg(await converted.blob.arrayBuffer());
    const scale = Math.min(w / image.width, h / image.height);
    page.drawRectangle({
      x,
      y: 792 - top - h,
      width: w,
      height: h,
      color: rgb(0.965, 0.958, 0.94),
    });
    page.drawImage(image, {
      x: x + (w - image.width * scale) / 2,
      y: 792 - top - h + (h - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  async function photos(ids: string[], label: string) {
    for (let n = 0; n < ids.length; n += 2) {
      ensure(180, label + ' · continued');
      for (let c = 0; c < 2 && n + c < ids.length; c++)
        await photo(ids[n + c], 48 + c * 264, y, 252, 155);
      y += 165;
    }
  }
  function summary() {
    paragraph('Summary by room', { size: 13, bolded: true, gap: 8 });
    text('Room', 48, y, 9, bold, muted);
    text('Items', 370, y, 9, bold, muted);
    text('Purchase total', 451, y, 9, bold, muted);
    y += 23;
    rule(y - 5);
    for (const room of s.rooms) {
      const rs = stats(data, property.id, room.id);
      const rows = wrap(room.name, 300, 10);
      ensure(rows.length * 15 + 12, 'Summary by room · continued');
      rows.forEach((r, n) => text(r, 48, y + n * 15));
      text(String(rs.items.length), 380, y);
      text(money(rs.total), 451, y);
      y += rows.length * 15 + 10;
      rule(y - 5);
    }
    ensure(48);
    text('Total documented purchase value', 48, y, 11, bold);
    text(money(s.total), 451, y, 11, bold);
    y += 28;
    paragraph(
      `${s.items.length} item ${s.items.length === 1 ? 'record' : 'records'} · ${s.unknown} without a recorded purchase price. Totals use per-unit price × quantity; unknown prices are excluded.`,
      { size: 9, color: muted },
    );
  }
  progress('Building cover and room summary…');
  newPage(options.cover ? 'Personal property inventory' : 'Inventory summary');
  paragraph(property.name, { size: 24, bolded: true, gap: 6 });
  paragraph(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    { size: 10, color: muted, gap: 14 },
  );
  if (options.cover) {
    if (property.coverPhoto) {
      await photo(property.coverPhoto, 48, y, 516, 170);
      y += 187;
    }
    const blocks: [string, string][] = [
      [
        'Policyholder',
        [property.clientName, property.clientPhone, property.clientEmail]
          .filter(Boolean)
          .join('\n'),
      ],
      ['Insured property', property.address],
      [
        'Insurance',
        [
          property.insurer,
          property.policyNumber ? `Policy: ${property.policyNumber}` : '',
          property.agentName ? `Agent: ${property.agentName}` : '',
          property.agentPhone,
        ]
          .filter(Boolean)
          .join('\n'),
      ],
      [
        'Inventory taken',
        [
          property.walkthroughStartDate ? `Started: ${property.walkthroughStartDate}` : '',
          property.walkthroughEndDate ? `Finished: ${property.walkthroughEndDate}` : '',
          data.organizer.name ? `Prepared by ${data.organizer.name}` : '',
          data.organizer.business,
          data.organizer.email,
          data.organizer.phone,
        ]
          .filter(Boolean)
          .join('\n'),
      ],
    ];
    for (let n = 0; n < blocks.length; n += 2) {
      const values = blocks
        .slice(n, n + 2)
        .map(([label, value]) => ({ label, lines: wrap(readable(value), 240, 10) }));
      const height = Math.max(...values.map((b) => b.lines.length)) * 15 + 40;
      ensure(height);
      values.forEach((b, c) => {
        const x = 48 + c * 270;
        text(b.label.toUpperCase(), x, y, 8, bold, muted);
        b.lines.forEach((row, k) => text(row, x, y + 19 + k * 15));
      });
      y += height;
    }
  } else paragraph(property.address, { size: 10, color: muted });
  if (s.needs || s.unsorted)
    paragraph(
      `PARTIAL INVENTORY · Unreviewed item records: ${s.needs}. Unassigned photos: ${s.unsorted}. Unassigned photos are excluded from item counts and values.`,
      { size: 10, color: green },
    );
  summary();
  for (const room of s.rooms) {
    const rs = stats(data, property.id, room.id);
    progress(`Building ${room.name}…`);
    newPage(room.name);
    paragraph(
      `${property.name} · ${rs.items.length} item ${rs.items.length === 1 ? 'record' : 'records'} · ${money(rs.total)}`,
      {
        size: 10,
        color: muted,
      },
    );
    if (options.roomPhotos && room.roomPhotos.length) {
      paragraph('Room overview', { size: 11, bolded: true });
      await photos(room.roomPhotos, room.name);
    }
    if (!rs.items.length) paragraph('No item records yet.', { color: muted });
    for (const item of rs.items) {
      const lines = wrap(title(item), 155, 10, bold);
      const receiptLineCount = wrap(
        item.receipts.map((r) => receiptCodes.get(r.id)).join(', '),
        180,
        8,
      ).length;
      const height = Math.max(64, lines.length * 14 + 24, receiptLineCount * 11 + 48);
      ensure(height + 25, room.name + ' · continued');
      page.drawRectangle({
        x: 48,
        y: 792 - y - height,
        width: 516,
        height,
        color: rgb(0.965, 0.958, 0.94),
      });
      lines.forEach((v, k) => text(v, 58, y + 10 + k * 14, 10, bold));
      text(item.reviewed ? 'Reviewed' : 'Needs details', 58, y + height - 19, 8, font, muted);
      text(`Qty ${item.quantity}`, 228, y + 11, 9);
      text(
        item.unitPriceCents === null ? 'Unit: unknown' : `Unit: ${money(item.unitPriceCents)}`,
        298,
        y + 11,
        9,
      );
      text(
        item.unitPriceCents === null ? 'Total: unknown' : money(itemTotal(item)),
        460,
        y + 11,
        9,
        bold,
      );
      text(item.purchaseDate || 'Date not recorded', 228, y + 33, 9, font, muted);
      const receiptLabel = item.receipts.length
        ? item.receipts.map((r) => receiptCodes.get(r.id)).join(', ')
        : 'None';
      const receiptLines = wrap(`Receipts: ${receiptLabel}`, 188, 8);
      receiptLines.forEach((v, k) => text(v, 360, y + 33 + k * 11, 8, font, muted));
      y += height + 9;
    }
    if (room.unsortedPhotos.length) {
      ensure(55);
      paragraph(
        `${room.unsortedPhotos.length} unassigned ${room.unsortedPhotos.length === 1 ? 'photo' : 'photos'}`,
        { size: 12, bolded: true },
      );
      paragraph(
        'These photos have not been labeled as items. No quantities or values have been inferred.',
        { size: 9, color: muted },
      );
      if (options.itemPhotos) await photos(room.unsortedPhotos, `${room.name} · unassigned photos`);
    }
    for (const item of rs.items) {
      newPage('Item record');
      paragraph(title(item), { size: 21, bolded: true, gap: 6 });
      paragraph(
        `${room.name} · ${property.name} · ${item.reviewed ? 'Reviewed' : 'Needs details'}`,
        { size: 9, color: muted },
      );
      if (options.itemPhotos) await photos(item.photos, title(item));
      field('Category', item.category);
      field('Purchase price per unit', money(item.unitPriceCents));
      field(
        'Quantity and total',
        `${item.quantity} ${item.quantity === 1 ? 'unit' : 'units'} · ${item.unitPriceCents === null ? 'Total not recorded' : money(itemTotal(item))}`,
      );
      field(
        'Purchase date / store',
        [item.purchaseDate || 'Date not recorded', item.store || 'Store not recorded'].join(' · '),
      );
      field(
        'Brand / model',
        [item.brand || 'Brand not recorded', item.model || 'Model not recorded'].join(' · '),
      );
      field('Serial number', item.serialNumber);
      field('Condition', item.condition);
      field('Notes / additional information', item.notes);
      field(
        'Receipts',
        item.receipts.length
          ? item.receipts.map((r) => receiptCodes.get(r.id)).join(', ') +
              (options.receipts
                ? ' · see appendix'
                : ' · originals held on device; appendix excluded')
          : 'None',
      );
    }
  }
  if (options.receipts)
    for (const item of s.items)
      for (const receipt of item.receipts) {
        const code = receiptCodes.get(receipt.id)!;
        progress(`Adding receipt ${code}…`);
        const asset = await getAsset(receipt.assetId);
        if (!asset) throw Error(`Receipt ${code} is missing from storage.`);
        if (asset.type === 'application/pdf') {
          try {
            for await (const rendered of renderPdfPages(asset.original)) {
              newPage(`Receipt ${code} · page ${rendered.number} of ${rendered.total}`);
              paragraph(`${title(item)} · ${asset.name}`, { size: 10 });
              const png = await new Promise<Blob>((resolve, reject) =>
                rendered.canvas.toBlob(
                  (b) => (b ? resolve(b) : reject(Error('PDF page could not be rendered.'))),
                  'image/png',
                ),
              );
              const img = await doc.embedPng(await png.arrayBuffer());
              const bounds = img.scaleToFit(516, 716 - y);
              page.drawImage(img, {
                x: 48 + (516 - bounds.width) / 2,
                y: 792 - y - bounds.height,
                width: bounds.width,
                height: bounds.height,
              });
              rendered.canvas.width = rendered.canvas.height = 0;
            }
          } catch {
            throw Error(
              `Receipt ${code} could not be rendered (it may be encrypted or damaged). View the original, replace it, or turn off the receipt appendix.`,
            );
          }
        } else {
          newPage(`Receipt ${code}`);
          paragraph(title(item), { size: 12, bolded: true });
          await photo(asset.id, 48, y, 516, 716 - y);
        }
      }
  const pages = doc.getPages();
  pages.forEach((p, n) => {
    page = p;
    rule(746);
    text(
      'Purchase prices from owner records. Unknown values are excluded.',
      48,
      756,
      8,
      font,
      muted,
    );
    text(`Page ${n + 1} of ${pages.length}`, 485, 756, 8, font, muted);
  });
  doc.setTitle(`${property.name} — Personal property inventory`);
  doc.setAuthor(
    [data.organizer.name, data.organizer.business].filter(Boolean).join(', ') || 'Jigsaw Homevault',
  );
  doc.setSubject('Documented personal property; purchase price per unit × quantity');
  return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
