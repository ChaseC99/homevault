import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { type Inventory, type Property, type Item, stats, money, title } from './model';
import { assetUrl } from './asset-url';
import { reportMediaLoader, type ReportMedia } from './report-media';

export interface ReportOptions {
  cover: boolean;
  roomPhotos: boolean;
  itemPhotos: boolean;
  receipts: boolean;
}
const ink = rgb(27 / 255, 26 / 255, 23 / 255),
  muted = rgb(95 / 255, 91 / 255, 83 / 255),
  line = rgb(227 / 255, 223 / 255, 214 / 255),
  mat = rgb(245 / 255, 243 / 255, 238 / 255),
  matBorder = rgb(239 / 255, 236 / 255, 229 / 255),
  missing = rgb(122 / 255, 62 / 255, 12 / 255);
const readable = (value: unknown) => String(value ?? '').trim() || '—';
const price = (value: number | null) => (value === null ? '—' : money(value));
const coverFooter = 'Purchase prices from receipts or owner records.';
const roomFooter = 'Photos and receipts for each item are on the pages after this table.';

// Date-only values must never pass through UTC/local timezone conversion.
export function reportDate(value: string | Date): string {
  if (value instanceof Date)
    return `${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}-${value.getFullYear()}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${iso[2]}-${iso[3]}-${iso[1]}`;
  const us = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return us ? `${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}-${us[3]}` : '—';
}
interface LabeledMedia {
  media: ReportMedia;
  caption: string;
  receipt: boolean;
}
const portrait = (image: LabeledMedia) => image.receipt || image.media.height > image.media.width;

export async function generateReport(
  data: Inventory,
  property: Property,
  options: ReportOptions,
  progress: (text: string) => void = () => {},
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const loadFont = async (path: string) => {
    const response = await fetch(assetUrl(path));
    if (!response.ok) throw Error('Report font unavailable. Finish offline setup and try again.');
    return doc.embedFont(await response.arrayBuffer(), { subset: false });
  };
  // Complete static TrueType fonts keep all outlines intact in PDF renderers.
  const [font, bold, heading] = await Promise.all([
    loadFont('fonts/report-regular.ttf'),
    loadFont('fonts/report-semibold.ttf'),
    loadFont('fonts/report-heading.ttf'),
  ]);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const loadMedia = reportMediaLoader(doc);
  const s = stats(data, property.id);
  const footers = new Map<PDFPage, string>();
  let page: PDFPage;
  let y = 40;
  const safe = (value: unknown) =>
    String(value ?? '')
      .replace(/\r/g, '')
      .replace(/\t/g, '  ');
  function wrap(value: unknown, width: number, size = 10, f: PDFFont = font) {
    const out: string[] = [];
    for (const paragraph of safe(value).split('\n')) {
      let row = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
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
  function fit(value: unknown, width: number, size: number, f = font) {
    return Math.min(size, (size * width) / Math.max(1, f.widthOfTextAtSize(safe(value), size)));
  }
  function right(
    value: unknown,
    end: number,
    top: number,
    size = 10,
    f = font,
    color = ink,
    width = 120,
  ) {
    const fitted = fit(value, width, size, f);
    text(value, end - f.widthOfTextAtSize(safe(value), fitted), top, fitted, f, color);
  }
  function rule(top: number, x = 48, width = 516, thickness = 1, color = line) {
    page.drawLine({
      start: { x, y: 792 - top },
      end: { x: x + width, y: 792 - top },
      color,
      thickness,
    });
  }
  function newPage(footer: string) {
    page = doc.addPage([612, 792]);
    footers.set(page, footer);
    y = 40;
  }
  function sectionPage(label: string, footer: string) {
    newPage(footer);
    const rows = wrap(label, 516, 20, heading);
    rows.forEach((row, index) => text(row, 48, 40 + index * 24, 20, heading));
    y = 40 + rows.length * 24 + 8;
    rule(y, 48, 516, 2, ink);
    y += 14;
  }
  function paragraph(value: unknown, size = 10, color = ink) {
    for (const row of wrap(value, 516, size)) {
      if (y + size + 5 > 718) sectionPage('Inventory summary', coverFooter);
      text(row, 48, y, size, font, color);
      y += size + 5;
    }
    y += 10;
  }
  function matSlot(x: number, top: number, width: number, height: number) {
    // SVG coordinates grow down from the slot's top edge. Stroke stays inside.
    const w = width - 1,
      h = height - 1,
      r = 4;
    page.drawSvgPath(
      `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
      {
        x: x + 0.5,
        y: 792 - top - 0.5,
        color: mat,
        borderColor: matBorder,
        borderWidth: 1,
      },
    );
  }
  function slot(
    images: LabeledMedia[],
    x: number,
    top: number,
    width: number,
    height: number,
    caption = true,
  ) {
    matSlot(x, top, width, height);
    if (images.length) {
      const gap = images.length === 2 ? 8 : 0;
      const availableWidth = width - 14 - gap;
      const ratios = images.map(({ media }) => media.width / media.height);
      // Shared height is constrained by BOTH the combined widths and slot height.
      const commonHeight = Math.min(
        height - 14,
        availableWidth / ratios.reduce((a, b) => a + b, 0),
      );
      const totalWidth = commonHeight * ratios.reduce((a, b) => a + b, 0) + gap;
      let left = x + (width - totalWidth) / 2;
      images.forEach(({ media }, index) => {
        const imageWidth = commonHeight * ratios[index];
        media.draw(page, left, 792 - top - (height + commonHeight) / 2, imageWidth, commonHeight);
        left += imageWidth + gap;
      });
    } else {
      const label = options.itemPhotos ? 'No item photos recorded' : 'Item photos not included';
      text(
        label,
        x + (width - font.widthOfTextAtSize(label, 10)) / 2,
        top + height / 2 - 5,
        10,
        font,
        muted,
      );
    }
    if (caption && images.length)
      text(images.map((image) => image.caption).join(' · '), x, top + height + 3, 8.5, font, muted);
  }
  async function image(assetId: string): Promise<LabeledMedia> {
    return { media: (await loadMedia(assetId))[0], caption: '', receipt: false };
  }

  progress('Building cover and room summary…');
  newPage(coverFooter);
  const propertyLines = wrap(property.name, 334, 26, heading);
  propertyLines.forEach((row, index) => text(row, 48, 40 + index * 30, 26, heading));
  right(`Generated ${reportDate(new Date())}`, 564, 54, 10, font, muted, 172);
  y = 40 + propertyLines.length * 30 + 16;
  if (options.cover) {
    if (property.coverPhoto) {
      slot([await image(property.coverPhoto)], 48, y, 516, 190, false);
      y += 206;
    }
    const dates = [property.walkthroughStartDate, property.walkthroughEndDate]
      .filter(Boolean)
      .map(reportDate);
    const blocks = [
      [
        'Homeowner',
        [
          readable(property.clientName),
          readable(property.clientPhone),
          readable(property.clientEmail),
        ].join('\n'),
      ],
      ['Property address', readable(property.address)],
      [
        'Inventory taken',
        [
          dates.length ? [...new Set(dates)].join(' – ') : '—',
          `Prepared by ${readable(data.organizer.name)}`,
          readable(data.organizer.business),
        ].join('\n'),
      ],
    ];
    const width = (516 - 40) / 3;
    const rows = blocks.map(([, value]) => wrap(value, width, 10));
    blocks.forEach(([label], index) => {
      const x = 48 + index * (width + 20);
      rule(y, x, width, 1, ink);
      text(label.toUpperCase(), x, y + 7, 9, bold, muted);
      rows[index].forEach((row, n) => text(row, x, y + 24 + n * 15, 10, n === 0 ? bold : font));
    });
    y += 24 + Math.max(...rows.map((rows) => rows.length)) * 15 + 20;
  } else paragraph(property.address, 10, muted);
  if (s.needs || s.unsorted)
    paragraph(
      `PARTIAL INVENTORY · ${s.needs} item records need details. ${s.unsorted} unassigned photos are excluded from item counts and values.`,
      9,
      muted,
    );
  function summaryHeader(continued = false) {
    if (continued || y + 65 > 718) sectionPage('Summary by room', coverFooter);
    else {
      text('Summary by room', 48, y, 13, bold);
      y += 25;
    }
    text('Room', 48, y, 10, bold, muted);
    right('Items', 438, y, 10, bold, muted);
    right('Purchase total', 564, y, 10, bold, muted);
    y += 22;
    rule(y - 4);
  }
  summaryHeader();
  for (const room of s.rooms) {
    const rs = stats(data, property.id, room.id);
    const rows = wrap(room.name, 320, 11);
    if (y + rows.length * 15 + 12 > 718) summaryHeader(true);
    rows.forEach((row, index) => text(row, 48, y + index * 15, 11));
    right(rs.items.length, 438, y, 11);
    right(money(rs.total), 564, y, 11);
    y += rows.length * 15 + 10;
    rule(y - 5, 48, 516, 1, matBorder);
  }
  if (y + 65 > 718) summaryHeader(true);
  rule(y - 5, 48, 516, 1.5, ink);
  text('Total', 48, y + 3, 11, bold);
  right(s.items.length, 438, y + 3, 11, bold);
  right(money(s.total), 564, y + 3, 11, bold);
  y += 30;
  paragraph(
    `${s.unknown} without a recorded purchase price. Totals use per-unit price × quantity; unknown prices are excluded.`,
    9,
    muted,
  );

  function itemHeader(item: Item, room: string, index: number, total: number, extra = '') {
    newPage(`${property.name} · ${room}`);
    const label =
      `${room} · Item ${index + 1} of ${total}${extra ? ` · ${extra}` : ''}`.toUpperCase();
    text(label, 48, 40, fit(label, 516, 9, bold), bold, muted);
    const titleWidth = extra ? 516 : 362;
    let size = 22;
    while (size > 14 && wrap(title(item), titleWidth, size, heading).length > 2) size--;
    const rows = wrap(title(item), titleWidth, size, heading);
    rows.forEach((row, n) => text(row, 48, 54 + n * (size + 3), size, heading));
    if (!extra) {
      right('PURCHASE PRICE', 564, 40, 9, bold, muted, 140);
      right(price(item.unitPriceCents), 564, 54, 22, heading, ink, 140);
    }
    y = 54 + Math.max(27, rows.length * (size + 3)) + 8;
    rule(y, 48, 516, 2, ink);
    y += 14;
  }
  function morePhotos(images: LabeledMedia[], header: () => void) {
    for (let i = 0; i < images.length; i += 2) {
      header();
      const pair = images.slice(i, i + 2);
      const availableHeight = 718 - y;
      if (pair.length === 1 || pair.every(portrait)) slot(pair, 48, y, 516, availableHeight - 15);
      else {
        const height = (availableHeight - 12) / 2 - 15;
        slot([pair[0]], 48, y, 516, height);
        slot([pair[1]], 48, y + height + 27, 516, height);
      }
    }
  }
  type DetailLine = {
    label?: string;
    value: string;
    f?: PDFFont;
    color?: typeof ink;
    full?: boolean;
    gap?: number;
  };
  const columnWidth = (516 - 40) / 3;
  function detailRows(label: string, value: unknown, f = font, color = ink): DetailLine[] {
    // Courier covers the customary serial alphabet; keep other recorded characters intact.
    if (
      f === mono &&
      [...safe(value)].some((c) => !mono.getCharacterSet().includes(c.codePointAt(0)!))
    )
      f = font;
    return wrap(readable(value), columnWidth - 60, 10, f).map((value, index, all) => ({
      label: index === 0 ? label : undefined,
      value,
      f,
      color,
      gap: index === all.length - 1 ? 5 : 0,
    }));
  }
  function detailColumns(columns: DetailLine[][], top: number, bottom: number) {
    const headings = ['Purchase', 'Identification', 'Condition & notes'];
    return columns.map((rows, index) => {
      const x = 48 + index * (columnWidth + 20);
      rule(top, x, columnWidth, 1, ink);
      text(headings[index].toUpperCase(), x, top + 7, 9, bold, muted);
      let at = top + 25,
        consumed = 0;
      for (const row of rows) {
        if (at + 14 > bottom) break;
        if (row.label) text(row.label, x, at, 10, font, muted);
        text(row.value, x + (row.full ? 0 : 60), at, 10, row.f ?? font, row.color ?? ink);
        at += 14 + (row.gap ?? 0);
        consumed++;
      }
      return rows.slice(consumed);
    });
  }

  for (const room of s.rooms) {
    const rs = stats(data, property.id, room.id);
    progress(`Building ${room.name}…`);
    function roomPage() {
      newPage(roomFooter);
      const rows = wrap(room.name, 240, 20, heading);
      rows.forEach((row, index) => text(row, 48, 40 + index * 24, 20, heading));
      right(
        `${property.name} · ${rs.items.length} items · ${money(rs.total)}`,
        564,
        50,
        10,
        font,
        muted,
        260,
      );
      y = 40 + rows.length * 24 + 8;
      rule(y, 48, 516, 2, ink);
      y += 14;
    }
    roomPage();
    if (options.roomPhotos) {
      for (let i = 0; i < room.roomPhotos.length; i += 4) {
        if (y + 120 > 718) roomPage();
        text('ROOM OVERVIEW', 48, y, 9, bold, muted);
        y += 20;
        for (let j = 0; j < 4 && i + j < room.roomPhotos.length; j++)
          slot([await image(room.roomPhotos[i + j])], 48 + j * 130.5, y, 124.5, 84, false);
        y += 100;
      }
    }
    function tableHeader() {
      text('Photo', 48, y, 9, bold, muted);
      text('Item', 90, y, 9, bold, muted);
      right('Qty', 317, y, 9, bold, muted);
      text('Purchased', 329, y, 9, bold, muted);
      right('Price', 500, y, 9, bold, muted);
      right('Receipt', 564, y, 9, bold, muted);
      y += 22;
      rule(y - 4);
    }
    if (y + 66 > 718) roomPage();
    tableHeader();
    if (!rs.items.length) text('No item records yet.', 48, y + 8, 10, font, muted);
    for (const item of rs.items) {
      const rows = wrap(title(item), 190, 10, bold);
      const height = Math.max(44, rows.length * 14 + 12);
      if (y + height > 718) {
        roomPage();
        tableHeader();
      }
      if (options.itemPhotos && item.photos[0])
        slot([await image(item.photos[0])], 48, y + 5, 32, 32, false);
      else text('—', 58, y + 12, 10, font, muted);
      rows.forEach((row, index) => text(row, 90, y + 10 + index * 14, 10, bold));
      right(item.quantity, 317, y + 10, 10, font, ink, 32);
      text(reportDate(item.purchaseDate), 329, y + 10, 9);
      right(price(item.unitPriceCents), 500, y + 10, 10, font, ink, 96);
      right(
        item.receipts.length ? 'Yes' : 'None',
        564,
        y + 10,
        10,
        font,
        item.receipts.length ? ink : missing,
        52,
      );
      y += height;
      rule(y - 2, 48, 516, 1, matBorder);
    }
    // Keep every item's evidence immediately after its room table, in table order.
    for (let index = 0; index < rs.items.length; index++) {
      const item = rs.items[index];
      progress(`Building ${room.name} · ${title(item)}…`);
      const photos: LabeledMedia[] = [];
      if (options.itemPhotos)
        for (let i = 0; i < item.photos.length; i++)
          photos.push({
            ...(await image(item.photos[i])),
            caption: `Photo ${i + 1} of ${item.photos.length}`,
          });
      const receiptMedia: ReportMedia[] = [];
      if (options.receipts)
        for (const receipt of item.receipts)
          receiptMedia.push(...(await loadMedia(receipt.assetId)));
      const receipts = receiptMedia.map((media, i): LabeledMedia => ({
        media,
        receipt: true,
        caption: `Receipt ${i + 1} of ${receiptMedia.length}`,
      }));
      let first: LabeledMedia[] = photos.slice(0, 1);
      if (photos.length === 1 && portrait(photos[0]) && receipts.length === 1)
        first.push(receipts[0]);
      else if (photos.length > 1 && portrait(photos[0]) && portrait(photos[1]))
        first.push(photos[1]);
      // Receipt-only items can use the first-page slot too.
      else if (!photos.length && receipts.length) first = receipts.slice(0, 1);
      const remainingPhotos = photos.filter((photo) => !first.includes(photo));
      const remainingReceipts = receipts.filter((receipt) => !first.includes(receipt));
      const remaining = [...remainingPhotos, ...remainingReceipts];
      itemHeader(item, room.name, index, rs.items.length);
      slot(first, 48, y, 516, 387);
      const infoTop = y + 387 + 29;
      const receiptStatus = !item.receipts.length
        ? 'None'
        : !options.receipts
          ? 'Not included'
          : first.some((image) => image.receipt)
            ? 'Shown above'
            : 'With photos';
      const columns = [
        [
          ...detailRows('Price', price(item.unitPriceCents), bold),
          ...detailRows('Date', reportDate(item.purchaseDate)),
          ...detailRows('Store', item.store),
          ...detailRows('Receipt', receiptStatus, font, !item.receipts.length ? missing : ink),
        ],
        [
          ...detailRows('Category', item.category),
          ...detailRows('Brand', item.brand),
          ...detailRows('Model', item.model),
          ...detailRows('Serial #', item.serialNumber, mono),
          ...detailRows('Quantity', item.quantity),
        ],
        [
          ...detailRows('Condition', item.condition),
          { label: 'Notes', value: '', full: true },
          ...wrap(readable(item.notes), columnWidth, 10).map((value) => ({ value, full: true })),
        ],
      ];
      let overflow = detailColumns(columns, infoTop, 675);
      const next = [
        remainingPhotos.length
          ? `${remainingPhotos.length} more ${remainingPhotos.length === 1 ? 'photo' : 'photos'}`
          : '',
        remainingReceipts.length
          ? `${remainingReceipts.length} ${remainingReceipts.length === 1 ? 'receipt' : 'receipts'}`
          : '',
      ]
        .filter(Boolean)
        .join(' and ');
      const hasOverflow = overflow.some((rows) => rows.length);
      const note = [
        next ? `Next pages: ${next}, two per page.` : '',
        hasOverflow ? 'Additional details follow.' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (note) wrap(note, 516, 9).forEach((row, i) => text(row, 48, 691 + i * 13, 9, font, muted));
      morePhotos(remaining, () =>
        itemHeader(item, room.name, index, rs.items.length, 'more photos'),
      );
      // Unusually long recorded text is never discarded or allowed to overlap a footer.
      while (overflow.some((rows) => rows.length)) {
        itemHeader(item, room.name, index, rs.items.length, 'more details');
        overflow = detailColumns(overflow, y, 718);
      }
    }
    if (options.itemPhotos && room.unsortedPhotos.length) {
      const unassigned: LabeledMedia[] = [];
      for (let i = 0; i < room.unsortedPhotos.length; i++)
        unassigned.push({
          ...(await image(room.unsortedPhotos[i])),
          caption: `Unassigned photo ${i + 1} of ${room.unsortedPhotos.length}`,
        });
      morePhotos(unassigned, () => {
        sectionPage(`${room.name} · unassigned photos`, `${property.name} · ${room.name}`);
        text('Not labeled as items. Excluded from item counts and values.', 48, y, 9, font, muted);
        y += 25;
      });
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    page = p;
    rule(734);
    const footer = footers.get(p)!;
    text(footer, 48, 742, fit(footer, 435, 9), font, muted);
    right(`Page ${index + 1} of ${pages.length}`, 564, 742, 9, font, muted, 76);
  });
  doc.setTitle(`${property.name} — Personal property inventory`);
  doc.setAuthor(
    [data.organizer.name, data.organizer.business].filter(Boolean).join(', ') || 'Jigsaw Homevault',
  );
  doc.setSubject('Documented personal property; purchase price per unit × quantity');
  return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
