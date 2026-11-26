import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const fixture = (name: string) => path.resolve('tests/fixtures', name);
test.beforeAll(async () => {
  await mkdir('artifacts', { recursive: true });
});
async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open('jigsaw-homevault');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('state').objectStore('state').get('inventory');
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
}
async function createRoom(page: Page) {
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Oak residence');
  await page.getByLabel('Street, city, state and ZIP').fill('123 Example Lane\nPortland, OR 97201');
  await page.getByLabel('Client / policyholder name').fill('Sample client');
  await page.getByLabel('Insurer', { exact: true }).fill('Example insurer');
  await page.getByLabel('Policy number').fill('QA-001');
  await page
    .getByLabel('Choose exterior photo', { exact: true })
    .setInputFiles(fixture('photo-3.jpg'));
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await page.getByRole('button', { name: 'Add rooms', exact: true }).first().click();
  await page.getByRole('button', { name: 'Living Room None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Bedroom None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Bedroom 1 in home', exact: true }).click();
  await page.getByRole('button', { name: 'Add 3 rooms', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bedroom 2 Not photographed yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Living Room Not photographed yet' }).click();
}
async function importPhotos(page: Page, names: string[]) {
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Camera options', exact: true })
    .getByLabel('Import photos', { exact: true })
    .setInputFiles(names.map(fixture));
  await expect(
    page.getByText(names.length === 1 ? 'Photo saved' : `${names.length} photos saved`, {
      exact: true,
    }),
  ).toBeVisible();
}
async function addItems(page: Page) {
  await page.getByRole('button', { name: 'Add items One item, a few angles', exact: true }).click();
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
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Organizer and device settings', exact: true }).click();
  await page.getByLabel('Organizer name', { exact: true }).fill('Alex Organizer');
  await page.getByLabel('Business', { exact: true }).fill('Example Organizing');
  await page.getByRole('button', { name: 'Save organizer information', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Organizer information saved');
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await createRoom(page);
  await page
    .getByRole('button', { name: 'Add room overview shots The room as a whole', exact: true })
    .click();
  await importPhotos(page, ['photo-3.jpg', 'photo-4.jpg']);
  await expect(page.getByRole('button', { name: 'Next item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // Keep coverage for older unassigned photos and reclassifying an overview.
  await page.getByRole('button', { name: 'Overview photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Move to item photos for sorting', exact: true }).click();
  await addItems(page);
  await importPhotos(page, ['photo-1.jpg', 'photo-2.jpg']);
  await expect(page.getByRole('heading', { name: 'Item 1 · 2 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /Untitled item 2 photos/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Walnut end table');
  await page.getByLabel('Category', { exact: true }).fill('Furniture');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Brand', { exact: true }).fill('Oak Home');
  await page.getByLabel('Model', { exact: true }).fill('TBL-24');
  await page.getByLabel('Serial number', { exact: true }).fill('TBL-2024-012');
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
  await page.getByRole('button', { name: 'Save reviewed record', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Walnut end table', exact: true })).toBeVisible();
  await expect(page.getByText('$760.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Walnut end table', exact: true })).toBeVisible();
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible();
  const state = await snapshot(page);
  expect(state.items).toHaveLength(1);
  expect(state.items[0].quantity).toBe(2);
  expect(state.items[0].unitPriceCents).toBe(38000);
  expect(state.items[0].receipts).toHaveLength(2);
  expect(state.rooms[0].unsortedPhotos).toHaveLength(1);
  await page.screenshot({ path: 'artifacts/item-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page.getByText('1 to sort', { exact: true })).toBeVisible();
  await expect(page.getByText('Report ready', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/property-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('1 photos still need sorting.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate PDF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your PDF is ready.', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await wait;
  await download.saveAs('artifacts/validated-inventory.pdf');
  const pdf = await PDFDocument.load(await readFile('artifacts/validated-inventory.pdf'));
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(8);
  for (const p of pdf.getPages()) {
    expect(p.getWidth()).toBe(612);
    expect(p.getHeight()).toBe(792);
  }
  await page.screenshot({ path: 'artifacts/report-mobile.png', fullPage: true });
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});
test('blank receipts retain originals and quota errors leave prior inventory unchanged', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 90000 });
  await createRoom(page);
  await addItems(page);
  await importPhotos(page, ['photo-1.jpg']);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /Untitled item 1 photos/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Attach image or PDF', { exact: true }).setInputFiles(fixture('blank.png'));
  await expect(page.getByText('Needs manual entry', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Date purchased', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const before = await snapshot(page);
  expect(before.items[0].reviewed).toBe(false);
  expect(before.items[0].receipts[0].status).toBe('failed');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return put.call(this, value, key!);
    };
  });
  await page.getByLabel('Item name', { exact: true }).fill('Must not persist');
  await expect(page.getByText(/Not saved: Storage is full/)).toBeVisible();
  await page.getByRole('button', { name: 'Save reviewed record', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  const after = await snapshot(page);
  expect(after.items[0].name).toBe(before.items[0].name);
  expect(after.items[0].reviewed).toBe(false);
});
test('skipped drafts remain saved without cycling through the same session', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 90000 });
  await createRoom(page);
  await addItems(page);
  await importPhotos(page, ['photo-1.jpg']);
  await page.getByRole('button', { name: 'Next item', exact: true }).click();
  await importPhotos(page, ['photo-4.jpg']);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /2 items need details/ }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Draft one');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('');
  await page.getByLabel('Item name', { exact: true }).fill('Draft two');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  const state = await snapshot(page);
  expect(state.items.map((i: any) => i.name)).toEqual(['Draft one', 'Draft two']);
  expect(state.items.every((i: any) => !i.reviewed)).toBe(true);
});
test('readiness detects a missing OCR model and repairs it when connected', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      await (await caches.open(name)).delete(new URL('ocr/eng.traineddata.gz', location.href).href);
  });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Organizer and device settings', exact: true }).click();
  await page.getByRole('button', { name: 'Check offline readiness', exact: true }).click();
  await expect(page.getByText('Offline setup needed', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 90000 });
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

test('simple live capture groups photos, undoes a split, saves on Done and never creates empty items', async ({
  page,
}) => {
  await installCameraFixture(page);
  await page.goto('./');
  await createRoom(page);
  await page.screenshot({ path: 'artifacts/room-capture-actions-mobile.png', fullPage: true });
  await addItems(page);
  const next = page.getByRole('button', { name: 'Next item', exact: true });
  const shutter = page.getByRole('button', { name: 'Take item photo', exact: true });
  await expect(next).toBeDisabled();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await snapshot(page)).items).toHaveLength(0);
  await addItems(page);
  await expect(shutter).toBeEnabled();
  // Two synchronous taps must produce one capture, even before React rerenders.
  await shutter.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Item 1 · 1 photo', exact: true })).toBeVisible();
  await shutter.click();
  await expect(page.getByRole('heading', { name: 'Item 1 · 2 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review latest photo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Original photo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Item 2 · 0 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Item 1 · 2 photos', exact: true })).toBeVisible();
  await expect(page.locator('.capture-thumbnail img')).toBeVisible();
  await page.screenshot({ path: 'artifacts/item-camera-mobile.png' });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const control of [
      shutter,
      next,
      page.getByRole('button', { name: 'Done', exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/item-camera-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Exercise the video-frame fallback using a synthetic live stream.
  await page.evaluate(() => {
    (window as any).failStillCapture = true;
  });
  await shutter.click();
  await expect(page.getByRole('heading', { name: 'Item 1 · 3 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await expect(page.getByText(/Live photos use video resolution/)).toBeVisible();
  await page.keyboard.press('Escape');
  await next.click();
  await shutter.click();
  await expect(page.getByRole('heading', { name: 'Item 2 · 1 photo', exact: true })).toBeVisible();
  await next.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  const state = await snapshot(page);
  expect(state.items.map((i: any) => i.photos.length)).toEqual([3, 1]);
  expect(state.items.every((i: any) => !i.reviewed)).toBe(true);
  expect(state.rooms[0].unsortedPhotos).toEqual([]);
  expect(state.rooms[0].roomPhotos).toEqual([]);
  expect(
    await page.evaluate(() =>
      (window as any).cameraTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.reload();
  expect((await snapshot(page)).items).toHaveLength(2);
  await addItems(page);
  await expect(page.getByRole('heading', { name: 'Item 3 · 0 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await snapshot(page)).items).toHaveLength(2);
  await page.getByRole('button', { name: 'Start walkthrough camera', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a room', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Room', exact: true })
    .selectOption({ label: 'Bedroom 2' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bedroom 2', exact: true })).toBeVisible();
});

test('capture failures do not create items; partial imports retain only saved photos and allow retry', async ({
  page,
}) => {
  await page.goto('./');
  await createRoom(page);
  await addItems(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return put.call(this, value, key!);
    };
    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = put;
    };
  });
  await page
    .getByLabel('Phone camera photo', { exact: true })
    .setInputFiles(fixture('photo-1.jpg'));
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page.getByRole('heading', { name: 'Item 1 · 0 photos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next item', exact: true })).toBeDisabled();
  expect((await snapshot(page)).items).toHaveLength(0);
  await page.evaluate(() => {
    (window as any).restorePut();
  });
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
  expect((await snapshot(page)).items.map((i: any) => i.photos.length)).toEqual([1]);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await importPhotos(page, ['photo-2.jpg']);
  await expect(page.getByRole('heading', { name: 'Item 1 · 2 photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  expect((await snapshot(page)).items.map((i: any) => i.photos.length)).toEqual([2]);
});

test('existing unassigned photos still support grouping and undo', async ({ page }) => {
  await page.goto('./');
  await createRoom(page);
  await page
    .getByRole('button', { name: 'Add room overview shots The room as a whole', exact: true })
    .click();
  await importPhotos(page, ['photo-1.jpg', 'photo-2.jpg']);
  await page.screenshot({ path: 'artifacts/overview-camera-mobile.png' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  for (let n = 0; n < 2; n++) {
    await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
    await page
      .getByRole('button', { name: 'Move to item photos for sorting', exact: true })
      .click();
  }
  await page.getByRole('button', { name: /2 photos to sort/ }).click();
  await page.getByRole('button', { name: 'Photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Make item', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('2 left to sort', { exact: true })).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(0);
});
