import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Inventory } from '../../src/lib/model';

const cards = (page: Page) => page.getByRole('list', { name: 'Labeled items' });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save & return to photos', exact: true });
const grid = (page: Page) => page.getByRole('heading', { name: 'Label photos', exact: true });
async function snapshot(page: Page): Promise<Inventory> {
  return page.evaluate(
    () =>
      new Promise<Inventory>((resolve, reject) => {
        const request = indexedDB.open('jigsaw-homevault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const query = db.transaction('state').objectStore('state').get('inventory');
          query.onsuccess = () => {
            resolve(query.result);
            db.close();
          };
        };
      }),
  );
}
async function select(page: Page, photos: number[]) {
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  for (const photo of photos)
    await page.getByRole('button', { name: `Select photo ${photo}`, exact: true }).click();
}
async function setup(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Labeling home');
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await page.getByRole('button', { name: 'Add rooms', exact: true }).first().click();
  await page.getByRole('button', { name: 'Living Room None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 room', exact: true }).click();
  await page.getByRole('button', { name: 'Living Room Not photographed yet', exact: true }).click();
  await page.getByRole('button', { name: 'Take photos in Living Room', exact: true }).click();
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Camera options' })
    .getByLabel('Import photos')
    .setInputFiles([1, 2, 3, 4].map((n) => path.resolve(`tests/fixtures/photo-${n}.jpg`)));
  await expect(page.locator('.capture-count')).toHaveText('4');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(grid(page)).toBeVisible();
}
async function failWrites(page: Page) {
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
}
async function restoreWrites(page: Page) {
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
}

test.beforeAll(() => mkdir('artifacts', { recursive: true }));

test('one photo opens every detail field directly; Save returns to the grid, permits blanks, and never duplicates items', async ({
  page,
}) => {
  await setup(page);
  const original = (await snapshot(page)).rooms[0].unsortedPhotos;
  await expect(page.getByRole('button', { name: 'Label 2 photos as one item' })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Label photo 2', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole('heading', { name: 'Label this item' })).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(1);
  await page.getByLabel('Item name', { exact: true }).fill('  Sofa  ');
  await page.getByLabel('Category', { exact: true }).fill('Furniture');
  await page.getByLabel('Purchase price per unit (USD)', { exact: true }).fill('425.50');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Date purchased', { exact: true }).fill('2026-11-21');
  await page.getByLabel('Where purchased', { exact: true }).fill('Example store');
  await page.getByLabel('Brand', { exact: true }).fill('Example brand');
  await page.getByLabel('Model', { exact: true }).fill('S1');
  await page.getByLabel('Serial number', { exact: true }).fill('ABC-123');
  await page.getByRole('combobox', { name: 'Condition', exact: true }).selectOption('Good');
  await page.getByLabel('Notes / additional information', { exact: true }).fill('Blue fabric');
  await expect(page.getByLabel('Attach image or PDF')).toBeAttached();
  await expect(page.getByLabel('Scan serial number', { exact: true })).toBeAttached();
  await page.getByRole('checkbox', { name: /Reviewed/ }).check();
  await save(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(grid(page)).toBeVisible();
  await expect(page.getByLabel('Item name', { exact: true })).toHaveCount(0);
  expect((await snapshot(page)).items).toHaveLength(1);
  expect((await snapshot(page)).items[0]).toMatchObject({
    name: 'Sofa',
    photos: [original[1]],
    category: 'Furniture',
    unitPriceCents: 42550,
    quantity: 2,
    purchaseDate: '2026-11-21',
    store: 'Example store',
    brand: 'Example brand',
    model: 'S1',
    serialNumber: 'ABC-123',
    condition: 'Good',
    notes: 'Blue fabric',
    reviewed: true,
  });
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await save(page).click();
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items[1]).toMatchObject({
    name: '',
    unitPriceCents: null,
    purchaseDate: '',
    reviewed: false,
  });
  await cards(page)
    .getByRole('button', { name: /Sofa 1 photo/ })
    .click();
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('Sofa');
  await page.reload();
  await expect(page.getByLabel('Notes / additional information')).toHaveValue('Blue fabric');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => scrollTo(0, 0));
  const button = (await save(page).boundingBox())!;
  const nameField = (await page.getByLabel('Item name', { exact: true }).boundingBox())!;
  expect(nameField.y + nameField.height).toBeLessThanOrEqual(button.y - 18);
  expect(button.y).toBeGreaterThanOrEqual(0);
  expect(button.y + button.height).toBeLessThanOrEqual(568);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/label-editor-320.png' });
  await save(page).click();
  await expect(grid(page)).toBeVisible();
  await page.screenshot({ path: 'artifacts/label-grid-320.png' });
});

test('failed creation and saves retain photos and draft work; invalid input blocks leaving until corrected', async ({
  page,
}) => {
  await setup(page);
  const before = await snapshot(page);
  await failWrites(page);
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  expect(await snapshot(page)).toEqual(before);
  await restoreWrites(page);
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Draft sofa');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('Draft sofa');
  await failWrites(page);
  await page.getByLabel('Notes / additional information').fill('Keep this unsaved note');
  await save(page).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page.getByLabel('Notes / additional information')).toHaveValue(
    'Keep this unsaved note',
  );
  await expect(grid(page)).toHaveCount(0);
  expect((await snapshot(page)).items[0].notes).toBe('');
  await restoreWrites(page);
  await page.getByLabel('Purchase price per unit (USD)').fill('invalid');
  await page.getByRole('button', { name: 'Photo grid', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('non-negative price');
  await expect(grid(page)).toHaveCount(0);
  await page.getByLabel('Purchase price per unit (USD)').fill('');
  await save(page).click();
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(1);
  expect((await snapshot(page)).items[0].notes).toBe('Keep this unsaved note');
});

test('secondary grouping supports cancel and undo in capture order without deleting entered details', async ({
  page,
}) => {
  await setup(page);
  const before = await snapshot(page);
  await select(page, [4, 2]);
  await page.getByRole('button', { name: 'Cancel selection', exact: true }).click();
  expect((await snapshot(page)).items).toHaveLength(0);
  await select(page, [4, 2]);
  await page.getByRole('button', { name: 'Label 2 photos as one item' }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  await save(page).click();
  await page.getByRole('button', { name: 'Undo photo change' }).click();
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toEqual(before.rooms[0].unsortedPhotos);
  expect((await snapshot(page)).items).toHaveLength(0);
  await select(page, [1, 3]);
  await page.getByRole('button', { name: 'Label 2 photos as one item' }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Chair');
  await save(page).click();
  await page.getByRole('button', { name: 'Undo photo change' }).click();
  await expect(page.getByText('Photos returned to the grid. Item details kept.')).toBeVisible();
  expect((await snapshot(page)).items[0]).toMatchObject({ name: 'Chair', photos: [] });
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toEqual(before.rooms[0].unsortedPhotos);
});

test('grid adds photos to an existing item without opening it and preserves overview handling and undo', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Sofa');
  await page.getByRole('checkbox', { name: /Reviewed/ }).check();
  await save(page).click();
  const before = await snapshot(page);
  await select(page, [3, 1]);
  await page.getByRole('combobox', { name: 'Add photos to' }).selectOption({ label: 'Sofa' });
  await page.getByRole('button', { name: 'Add to item', exact: true }).click();
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(1);
  expect((await snapshot(page)).items[0].photos).toHaveLength(3);
  expect((await snapshot(page)).items[0].reviewed).toBe(false);
  await page.getByRole('button', { name: 'Undo photo change' }).click();
  expect((await snapshot(page)).items[0]).toEqual(before.items[0]);
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toEqual(before.rooms[0].unsortedPhotos);
  await select(page, [1]);
  await page.getByRole('combobox', { name: 'Add photos to' }).selectOption({ label: 'Sofa' });
  await page.getByRole('button', { name: 'Add to item', exact: true }).click();
  await cards(page)
    .getByRole('button', { name: /Sofa 2 photos/ })
    .click();
  await page.getByLabel('Notes / additional information').fill('New detail after adding photos');
  await save(page).click();
  await page.getByRole('button', { name: 'Undo photo change' }).click();
  expect((await snapshot(page)).items[0]).toMatchObject({
    notes: 'New detail after adding photos',
    reviewed: false,
  });
  await select(page, [2]);
  await page.getByRole('button', { name: 'These are room overview photos' }).click();
  expect((await snapshot(page)).rooms[0].roomPhotos).toEqual([before.rooms[0].unsortedPhotos[1]]);
  await page.getByRole('button', { name: 'Living Room', exact: true }).click();
  await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Move to item photos for labeling' }).click();
  expect((await snapshot(page)).rooms[0].roomPhotos).toEqual([]);
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toHaveLength(3);
});

test('ordinary item pages are immediately editable and keep photo import, room photo selection and organizing', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Lamp');
  await page.getByRole('button', { name: 'Choose additional room photos' }).click();
  await page.getByRole('button', { name: 'Add room photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Add selected photos' }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  await save(page).click();
  await page.getByRole('button', { name: 'Living Room', exact: true }).click();
  await page.getByRole('button', { name: /Lamp 2 photos/ }).click();
  await expect(page).toHaveURL(/#\/item\//);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Item name', { exact: true })).toBeEditable();
  await page.getByLabel('Brand', { exact: true }).fill('New brand');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('New brand');
  await page
    .getByLabel('Add item photos', { exact: true })
    .setInputFiles(path.resolve('tests/fixtures/photo-4.jpg'));
  await expect(page.locator('.editable-photo')).toHaveCount(3);
  const photos = (await snapshot(page)).items[0].photos;
  await page.getByText('Organize photos', { exact: true }).click();
  await page.getByRole('button', { name: 'Make first', exact: true }).nth(2).click();
  expect((await snapshot(page)).items[0].photos[0]).toBe(photos[2]);
  await page.getByRole('button', { name: 'Return to grid', exact: true }).first().click();
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  expect((await snapshot(page)).rooms[0].unsortedPhotos).toContain(photos[2]);
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  expect((await snapshot(page)).items[0].brand).toBe('New brand');
  await page.getByRole('button', { name: /Lamp 2 photos/ }).click();
  await page.getByRole('button', { name: 'Living Room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
});

test('browser Back flushes drafts and a failed navigation save keeps the editor open for retry', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Keep my name');
  await page.evaluate(() => history.back());
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items[0].name).toBe('Keep my name');
  await cards(page)
    .getByRole('button', { name: /Keep my name/ })
    .click();
  await failWrites(page);
  await page.getByLabel('Notes / additional information').fill('Keep my note too');
  await page.getByRole('link', { name: 'Jigsaw Homevault home' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page.getByLabel('Notes / additional information')).toHaveValue('Keep my note too');
  await expect(page).toHaveURL(/#\/sort\/[^?]+\?item=/);
  await restoreWrites(page);
  await save(page).click();
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items[0].notes).toBe('Keep my note too');
});
