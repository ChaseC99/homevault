import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFRawStream, degrees } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateReport, reportDate, type ReportOptions } from '../src/lib/report';
import { jpegOrientation } from '../src/lib/report-media';
import { emptyInventory, newItem, newRoom, type Asset, type Property } from '../src/lib/model';

const { assets } = vi.hoisted(() => ({ assets: new Map<string, Asset>() }));
vi.mock('../src/lib/db', () => ({ getAsset: async (id: string) => assets.get(id) }));
const options: ReportOptions = { cover: true, roomPhotos: true, itemPhotos: true, receipts: true };
const property: Property = {
  id: 'property',
  name: 'Nguyen residence',
  coverPhoto: 'landscape',
  clientName: 'Sample homeowner',
  clientPhone: '555-0100',
  clientEmail: 'owner@example.com',
  address: '412 Oak Lane\nPortland, OR 97201',
  insurer: 'PRIVATE INSURER',
  policyNumber: 'PRIVATE POLICY',
  agentName: 'PRIVATE AGENT',
  agentPhone: '555-0199',
  walkthroughStartDate: '2026-11-18',
  walkthroughEndDate: '2026-11-25',
  createdAt: '',
  updatedAt: '',
};
function inventory() {
  const data = emptyInventory();
  data.properties = [property];
  data.organizer = { name: 'Sample organizer', business: 'Organized homes', email: '', phone: '' };
  data.rooms = [newRoom(property.id, 'Living Room', [])];
  return data;
}
function item(
  data: ReturnType<typeof inventory>,
  name: string,
  photos: string[],
  receipts: string[] = [],
) {
  const value = newItem(data.rooms[0].id, photos);
  Object.assign(value, {
    name,
    category: 'Electronics',
    brand: 'Sample',
    model: 'QN65S90D',
    serialNumber: '0Z4K3XR',
    purchaseDate: '2024-03-14',
    store: 'Sample store',
    condition: 'Good',
    notes: 'Wall-mounted above fireplace. Original box kept in garage.',
    unitPriceCents: 129900,
    reviewed: true,
    receipts: receipts.map((assetId, i) => ({
      id: `${name}-${i}`,
      assetId,
      status: 'read',
      text: '',
    })),
  });
  data.items.push(value);
  return value;
}
async function addAsset(id: string, filename: string, type: string) {
  const bytes = await readFile(`tests/fixtures/${filename}`);
  assets.set(id, {
    id,
    original: new Blob([bytes], { type }),
    thumbnail: null,
    width: 40,
    height: 40,
    name: filename,
    type,
    capturedAt: '',
  });
}
async function inspect(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const reader = await task.promise;
  const pages: string[] = [];
  const positions: { page: number; value: string; x: number; y: number; width: number }[] = [];
  const imageCounts: number[] = [];
  for (let index = 1; index <= reader.numPages; index++) {
    const page = await reader.getPage(index);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((value) => ('str' in value ? value.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
    for (const value of content.items)
      if ('str' in value && value.str.trim())
        positions.push({
          page: index,
          value: value.str,
          x: value.transform[4],
          y: value.transform[5],
          width: value.width,
        });
    const operators = await page.getOperatorList();
    imageCounts.push(operators.fnArray.filter((op) => op === OPS.paintImageXObject).length);
  }
  await task.destroy();
  return { doc, pages, positions, imageCounts };
}
beforeEach(async () => {
  assets.clear();
  vi.stubGlobal(
    'fetch',
    async (path: string) => new Response(await readFile(`public/${path.replace(/^\//, '')}`)),
  );
  await Promise.all([
    addAsset('landscape', 'report-landscape.jpg', 'image/jpeg'),
    addAsset('portrait', 'report-portrait.jpg', 'image/jpeg'),
    addAsset('receipt', 'receipt.png', 'image/png'),
    addAsset('pdf', 'receipt-two-pages.pdf', 'application/pdf'),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe('claim-ready report', () => {
  it('formats report dates without shifting date-only values across timezones', () => {
    expect(reportDate('2024-03-14')).toBe('03-14-2024');
    expect(reportDate('2024-03-14T00:00:00Z')).toBe('03-14-2024');
    expect(reportDate('3/4/2024')).toBe('03-04-2024');
    expect(reportDate(new Date(2024, 2, 14))).toBe('03-14-2024');
    expect(reportDate('')).toBe('—');
  });

  it('renders every layout, preserves originals, and places receipts with their item', async () => {
    const data = inventory();
    data.rooms[0].roomPhotos = ['landscape'];
    item(
      data,
      'Landscape television',
      ['landscape', 'portrait', 'landscape', 'portrait', 'portrait'],
      ['receipt', 'pdf'],
    );
    item(data, 'Single portrait', ['portrait']);
    item(data, 'Two portraits', ['portrait', 'portrait', 'landscape']);
    item(data, 'Portrait with receipt', ['portrait'], ['receipt']);
    item(data, 'Portrait then landscape', ['portrait', 'landscape'], ['receipt']);
    const draft = newItem(data.rooms[0].id, ['landscape']);
    draft.name = 'Draft with missing fields';
    data.items.push(draft);
    const other = newRoom(property.id, 'Kitchen', data.rooms);
    data.rooms.push(other);
    const last = item(data, 'Kitchen item', ['landscape']);
    last.roomId = other.id;
    const blob = await generateReport(data, property, options);
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/report-layouts.pdf', new Uint8Array(await blob.arrayBuffer()));
    const { doc, pages, positions, imageCounts } = await inspect(blob);
    expect(pages).toHaveLength(16);
    expect(pages[0]).toContain('HOMEOWNER');
    expect(pages[0]).toContain('PROPERTY ADDRESS');
    expect(pages[0]).toContain('11-18-2026 – 11-25-2026');
    expect(pages[0]).toMatch(/Generated \d{2}-\d{2}-\d{4}/);
    expect(pages[0]).toContain('Purchase prices from receipts or owner records.');
    expect(pages[0]).not.toMatch(
      /Personal property inventory|PRIVATE|Policyholder|Insured property|Generated on device/,
    );
    expect(pages[1]).toContain('Photo Item Qty Purchased Price Receipt');
    expect(pages[1]).not.toMatch(/Serial|Electronics|Good|Continued on next page/);
    expect(pages[1]).toContain('None');
    expect(pages[1]).toContain('03-14-2024');
    expect(pages[2]).toContain('Photo 1 of 5');
    expect(pages[2]).toContain('Next pages: 4 more photos and 3 receipts, two per page.');
    expect(pages[2]).toContain('With photos');
    expect(pages[3]).toContain('Photo 2 of 5');
    expect(pages[3]).toContain('Photo 3 of 5');
    expect(pages[4]).toContain('Photo 4 of 5 · Photo 5 of 5');
    expect(pages[5]).toContain('Receipt 1 of 3 · Receipt 2 of 3');
    expect(pages[6]).toContain('Receipt 3 of 3');
    for (const index of [3, 4, 5, 6, 9, 12])
      expect(pages[index]).not.toMatch(/PURCHASE PRICE|With photos|Store Sample store/);
    expect(pages[7]).toContain('Single portrait');
    expect(pages[8]).toContain('Photo 1 of 3 · Photo 2 of 3');
    expect(pages[9]).toContain('Photo 3 of 3');
    expect(pages[10]).toContain('Photo 1 of 1 · Receipt 1 of 1');
    expect(pages[10]).toContain('Shown above');
    expect(pages[11]).toContain('Photo 1 of 2');
    expect(pages[12]).toContain('Photo 2 of 2');
    expect(pages[12]).toContain('Receipt 1 of 1');
    expect(imageCounts.slice(2, 5)).toEqual([1, 2, 2]);
    expect(pages.join(' ')).not.toMatch(
      /appendix|A-1|2024-03-14|This item fits on one page|Full resolution|zoom in for labels/,
    );
    for (const [index, page] of doc.getPages().entries()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
      expect(pages[index]).toContain(`Page ${index + 1} of ${pages.length}`);
    }
    for (const position of positions) {
      expect(position.x, `${position.page}: ${position.value}`).toBeGreaterThanOrEqual(47.9);
      expect(
        position.x + position.width,
        `${position.page}: ${position.value}`,
      ).toBeLessThanOrEqual(564.1);
      expect(position.y, `${position.page}: ${position.value}`).toBeGreaterThanOrEqual(40);
      expect(position.y, `${position.page}: ${position.value}`).toBeLessThanOrEqual(752);
    }
    const images = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter(
        (object): object is PDFRawStream =>
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      );
    const original = new Uint8Array(await assets.get('landscape')!.original.arrayBuffer());
    const embedded = images.find(
      (image) => image.dict.get(PDFName.of('Width'))?.toString() === '3200',
    );
    expect(embedded!.dict.get(PDFName.of('Height'))?.toString()).toBe('2400');
    expect(embedded!.getContents()).toEqual(original);
    expect(
      images.filter((image) => image.dict.get(PDFName.of('Width'))?.toString() === '3200'),
    ).toHaveLength(1);
    const receiptSource = await PDFDocument.load(await assets.get('pdf')!.original.arrayBuffer());
    expect(receiptSource.getPageCount()).toBe(2);
    expect(
      doc.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'),
        ).length,
    ).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('flows room tables, keeps all long notes, and handles excluded photos and receipts', async () => {
    const data = inventory();
    for (let i = 0; i < 17; i++) item(data, `Item ${i + 1}`, [], []);
    data.items[0].notes = 'A detailed observation about the item. '.repeat(70) + 'END OF NOTES';
    data.items[0].receipts = [{ id: 'receipt', assetId: 'receipt', status: 'read', text: '' }];
    const { pages, positions } = await inspect(
      await generateReport(data, property, {
        ...options,
        cover: false,
        itemPhotos: false,
        receipts: false,
      }),
    );
    expect(pages[1]).toContain('Item 1');
    expect(pages[2]).toContain('Item 17');
    expect(pages[2]).toContain('Photo Item Qty Purchased Price Receipt');
    expect(pages[3]).toContain('ITEM 1 OF 17');
    expect(pages[3]).toContain('Not included');
    expect(pages.join(' ')).toContain('END OF NOTES');
    expect(pages.join(' ')).not.toContain('Receipt 1 of');
    expect(positions.every((position) => position.y >= 40 && position.y <= 752)).toBe(true);
  }, 30000);

  it('preserves rotated JPEG pixels and rotated/blank PDF receipt pages', async () => {
    const original = new Uint8Array(await assets.get('landscape')!.original.arrayBuffer());
    const exif = Uint8Array.from([
      0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1,
      0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const rotated = new Uint8Array(original.length + exif.length);
    rotated.set(original.slice(0, 2));
    rotated.set(exif, 2);
    rotated.set(original.slice(2), 2 + exif.length);
    expect(jpegOrientation(rotated)).toBe(6);
    assets.set('rotated', {
      ...assets.get('landscape')!,
      id: 'rotated',
      original: new Blob([rotated]),
    });
    const source = await PDFDocument.create();
    source.addPage([400, 600]).drawText('Rotated receipt', { x: 40, y: 500 });
    source.getPage(0).setRotation(degrees(90));
    source.addPage([400, 600]);
    assets.set('rotated-pdf', {
      ...assets.get('pdf')!,
      id: 'rotated-pdf',
      original: new Blob([new Uint8Array(await source.save()).buffer]),
    });
    const data = inventory();
    item(data, 'Rotated photograph', ['rotated'], ['receipt']);
    item(data, 'PDF only', [], ['rotated-pdf']);
    const blob = await generateReport(data, property, options);
    await writeFile('artifacts/report-orientation.pdf', new Uint8Array(await blob.arrayBuffer()));
    const { pages } = await inspect(blob);
    expect(pages[2]).toContain('Photo 1 of 1 · Receipt 1 of 1');
    expect(pages[3]).toContain('Receipt 1 of 2');
    expect(pages[4]).toContain('Receipt 2 of 2');
  }, 30000);
});
