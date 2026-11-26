import { test, expect, type Page } from '@playwright/test';
import {
  createRoom,
  failWrites,
  fixture,
  importPhotos,
  restoreWrites,
  snapshot,
  waitForOffline,
} from './helpers';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';
test.beforeAll(async () => {
  await mkdir('artifacts', { recursive: true });
});
async function addItems(page: Page) {
  await page.getByRole('button', { name: 'Take photos in Living Room', exact: true }).click();
}
async function makeItem(page: Page, photos: number[]) {
  if (photos.length === 1) {
    await page.getByRole('button', { name: `Label photo ${photos[0]}`, exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Select photos', exact: true }).click();
    for (const number of photos)
      await page.getByRole('button', { name: `Select photo ${number}`, exact: true }).click();
    await page
      .getByRole('button', { name: `Label ${photos.length} photos as one item`, exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Save & return to photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Label photos', exact: true })).toBeVisible();
}
async function backToRoom(page: Page) {
  await page
    .getByRole('navigation', { name: 'Page navigation' })
    .getByRole('button', { name: 'Living Room', exact: true })
    .click();
}
test('complete offline workflow, real OCR, corrected unit price and complete PDF appendix', async ({
  page,
  context,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const remote: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(baseURL!)) remote.push(r.url());
  });
  await page.goto('./');
  await waitForOffline(page);
  await context.setOffline(true);
  await page.reload();
  await waitForOffline(page);
  await page.getByRole('button', { name: 'Organizer and device settings', exact: true }).click();
  await page.getByLabel('Organizer name', { exact: true }).fill('Alex Organizer');
  await page.getByLabel('Business', { exact: true }).fill('Example Organizing');
  await page.getByRole('button', { name: 'Save organizer information', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Organizer information saved' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await createRoom(page);
  await page.getByRole('button', { name: 'Add overview shots', exact: true }).click();
  await importPhotos(page, ['photo-3.jpg', 'photo-4.jpg']);
  await expect(page.getByRole('button', { name: 'Next item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // Keep coverage for older unassigned photos and reclassifying an overview.
  await page.getByRole('button', { name: 'Overview photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Move to item photos for labeling', exact: true }).click();
  await addItems(page);
  await importPhotos(page, ['photo-1.jpg', 'photo-2.jpg']);
  await expect(page.locator('.capture-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await makeItem(page, [2, 3]);
  await backToRoom(page);
  await page.getByRole('button', { name: /Item 1 2 photos/ }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Walnut end table');
  await page.getByLabel('Category', { exact: true }).fill('Furniture');
  await page.getByLabel('Brand', { exact: true }).fill('Oak Home');
  await page.getByLabel('Model', { exact: true }).fill('TBL-24');
  // Read a synthetic serial label through the real bundled OCR engine.
  const label = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 260;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1400, 260);
    ctx.fillStyle = '#000';
    ctx.font = '60px Arial';
    ctx.fillText('S/N: AB-2026-001', 80, 140);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Scan serial number', { exact: true }).setInputFiles({
    name: 'serial.png',
    mimeType: 'image/png',
    buffer: Buffer.from(label, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Use serial number' })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Use serial number' }).click();
  await expect(page.getByLabel('Serial number', { exact: true })).toHaveValue('AB-2026-001');
  await page
    .getByLabel('Notes / additional information', { exact: true })
    .fill('Pair of walnut tables. Small mark on left leg.');
  await page
    .getByLabel('Attach image or PDF', { exact: true })
    .setInputFiles(fixture('receipt.png'));
  await expect(page.getByText('Receipt total: $760.00', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Date purchased', { exact: true })).toHaveValue('2026-11-21');
  await expect(page.getByLabel('Where purchased', { exact: true })).toHaveValue('OAK HOME STORE');
  await expect(page.getByRole('button', { name: 'Divide by 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use as unit price' }).click();
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue(
    '760.00',
  );
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Divide by 2', exact: true }).click();
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue(
    '380.00',
  );
  await page
    .getByLabel('Attach image or PDF', { exact: true })
    .setInputFiles(fixture('receipt-two-pages.pdf'));
  await expect(page.getByText('Read · check details', { exact: true })).toHaveCount(2, {
    timeout: 90000,
  });
  await page.getByRole('combobox', { name: 'Condition', exact: true }).selectOption('Good');
  await page.getByRole('checkbox', { name: /Reviewed/ }).check();
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Walnut end table 2 photos/ }).click();
  await expect(page.locator('.total-line')).toContainText('$760.00');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Walnut end table', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Reviewed/ })).toBeChecked();
  const state = await snapshot(page);
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({
    name: 'Walnut end table',
    category: 'Furniture',
    brand: 'Oak Home',
    model: 'TBL-24',
    serialNumber: 'AB-2026-001',
    notes: 'Pair of walnut tables. Small mark on left leg.',
    condition: 'Good',
    quantity: 2,
    unitPriceCents: 38000,
    purchaseDate: '2026-11-21',
    store: 'OAK HOME STORE',
    reviewed: true,
  });
  expect(state.items[0].receipts).toHaveLength(2);
  expect(state.rooms[0].unsortedPhotos).toHaveLength(1);
  await expect(page.locator('.receipt-thumbnail img')).toHaveCount(2);
  await page.getByRole('button', { name: 'View receipt 1', exact: true }).click();
  const imageReceipt = page.getByRole('dialog', { name: 'Receipt 1', exact: true });
  await expect(
    imageReceipt.getByRole('img', { name: 'Receipt 1, page 1', exact: true }),
  ).toBeVisible();
  await imageReceipt.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View receipt 2', exact: true }).click();
  const receiptDialog = page.getByRole('dialog', { name: 'Receipt 2', exact: true });
  await expect(receiptDialog.getByRole('img', { name: 'Receipt 2, page 1' })).toBeVisible();
  await receiptDialog.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(receiptDialog.getByRole('img', { name: 'Receipt 2, page 2' })).toBeVisible();
  await receiptDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await backToRoom(page);
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page.getByText('1 to label', { exact: true })).toBeVisible();
  await expect(page.getByText('Report ready', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('1 photos still need labeling.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate PDF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your PDF is ready.', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await wait;
  await download.saveAs('artifacts/validated-inventory.pdf');
  const pdf = await PDFDocument.load(await readFile('artifacts/validated-inventory.pdf'));
  // Cover, one room, one item, an image receipt, and both pages of the PDF receipt.
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(6);
  for (const p of pdf.getPages()) {
    expect(p.getWidth()).toBe(612);
    expect(p.getHeight()).toBe(792);
  }
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});
test('unreadable receipts retain originals and leave unknown fields blank', async ({ page }) => {
  await page.goto('./');
  await waitForOffline(page);
  await createRoom(page);
  await addItems(page);
  await importPhotos(page, ['photo-1.jpg']);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await makeItem(page, [1]);
  await backToRoom(page);
  await page.getByRole('button', { name: /Item 1 1 photo/ }).click();
  await page.getByLabel('Attach image or PDF', { exact: true }).setInputFiles(fixture('blank.png'));
  await expect(page.getByText('Needs manual entry', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Date purchased', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await page.getByRole('button', { name: /Item 1 1 photo/ }).click();
  const before = await snapshot(page);
  expect(before.items[0].reviewed).toBe(false);
  expect(before.items[0].receipts[0].status).toBe('failed');
  await page.reload();
  await page.getByRole('button', { name: 'View receipt 1', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Receipt 1', exact: true })
      .getByRole('img', { name: 'Receipt 1, page 1', exact: true }),
  ).toBeVisible();
});
async function installCameraFixture(page: Page) {
  const photo = `data:image/jpeg;base64,${(await readFile(fixture('photo-1.jpg'))).toString('base64')}`;
  await page.addInitScript(
    ({ photo }) => {
      const state = window as any;
      state.cameraTracks = [];
      let canvas: HTMLCanvasElement;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          const img = new Image();
          img.src = photo;
          await img.decode();
          canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          const stream = canvas.captureStream(10);
          state.cameraTracks.push(...stream.getTracks());
          return stream;
        },
      });
      state.ImageCapture = class {
        async takePhoto() {
          if (state.failStillCapture) throw Error('Synthetic still-photo failure');
          await new Promise((resolve) => setTimeout(resolve, 250));
          return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        }
      };
    },
    { photo },
  );
}

test('live photos persist before sorting, zoom crops saved images, and no empty items are created', async ({
  page,
}) => {
  await installCameraFixture(page);
  await page.goto('./');
  await createRoom(page);
  await addItems(page);
  const shutter = page.getByRole('button', { name: 'Take item photo', exact: true });
  await expect(page.getByRole('button', { name: 'Next item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await snapshot(page)).items).toHaveLength(0);
  await addItems(page);
  await expect(shutter).toBeEnabled();
  await shutter.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await expect(page.locator('.capture-count')).toHaveText('1');
  const zoomToggle = page.getByRole('button', { name: 'Adjust zoom', exact: true });
  const zoom = page.getByRole('slider', { name: 'Camera zoom' });
  await expect(zoom).toHaveCount(0);
  await zoomToggle.click();
  await zoom.fill('2');
  await expect(zoomToggle).toHaveText('2×');
  await shutter.click();
  await expect(page.locator('.capture-count')).toHaveText('2');
  expect((await snapshot(page)).items).toHaveLength(0);
  const dimensions = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('jigsaw-homevault');
      r.onsuccess = () => resolve(r.result);
    });
    const inventory = await new Promise<any>((resolve) => {
      const q = db.transaction('state').objectStore('state').get('inventory');
      q.onsuccess = () => resolve(q.result);
    });
    const sizes = [];
    for (const id of inventory.rooms[0].unsortedPhotos) {
      const asset = await new Promise<any>((resolve) => {
        const q = db.transaction('assets').objectStore('assets').get(id);
        q.onsuccess = () => resolve(q.result);
      });
      const bitmap = await createImageBitmap(asset.original);
      sizes.push([bitmap.width, bitmap.height]);
      bitmap.close();
    }
    db.close();
    return sizes;
  });
  expect(dimensions[1]).toEqual(dimensions[0].map((value) => Math.round(value / 2)));
  await page.getByRole('button', { name: 'Review latest photo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Original photo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Label photos', exact: true })).toHaveCount(0);
  await expect(zoomToggle).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => {
    (window as any).failStillCapture = true;
  });
  await shutter.click();
  await expect(page.locator('.capture-count')).toHaveText('3');
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await expect(page.getByText(/Live photos use video resolution/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Label photos', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).cameraTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByText('3 left to label', { exact: true })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.items).toEqual([]);
  expect(saved.rooms[0].unsortedPhotos).toHaveLength(3);
  expect(saved.rooms[0].roomPhotos).toEqual([]);
});

test('capture failures do not create items; partial imports retain only saved photos and allow retry', async ({
  page,
}) => {
  await page.goto('./');
  await createRoom(page);
  await addItems(page);
  await failWrites(page);
  await page
    .getByLabel('Phone camera photo', { exact: true })
    .setInputFiles(fixture('photo-1.jpg'));
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page.locator('.capture-count')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next item', exact: true })).toHaveCount(0);
  expect((await snapshot(page)).items).toHaveLength(0);
  await restoreWrites(page);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Camera options', exact: true })
    .getByLabel('Import photos', { exact: true })
    .setInputFiles([
      { name: 'first.jpg', mimeType: 'image/jpeg', buffer: await readFile(fixture('photo-1.jpg')) },
      { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a photo') },
      { name: 'last.jpg', mimeType: 'image/jpeg', buffer: await readFile(fixture('photo-2.jpg')) },
    ]);
  await expect(
    page.getByText('1 saved. Retry the remaining photos.', { exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toHaveLength(1);
  expect((await snapshot(page)).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await importPhotos(page, ['photo-2.jpg']);
  await expect(page.locator('.capture-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(page.getByText('2 left to label', { exact: true })).toBeVisible();
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toHaveLength(2);
  expect((await snapshot(page)).items).toHaveLength(0);
});
