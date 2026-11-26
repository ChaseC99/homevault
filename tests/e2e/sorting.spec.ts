import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Inventory } from '../../src/lib/model';

const naming = (page: Page) => page.getByRole('dialog', { name: 'What’s this item?' });
const groupCards = (page: Page) => page.getByRole('list', { name: 'Grouped items' });
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
  for (const photo of photos)
    await page.getByRole('button', { name: `Photo ${photo}`, exact: true }).click();
}
async function group(page: Page, photos: number[]) {
  await select(page, photos);
  await page
    .getByRole('button', {
      name: `Group ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`,
      exact: true,
    })
    .click();
  await expect(naming(page)).toBeVisible();
}
async function setup(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Sorting home');
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
  await expect(page.getByRole('heading', { name: 'Sort photos', exact: true })).toBeVisible();
}

test.beforeAll(() => mkdir('artifacts', { recursive: true }));

test('grouping asks for a name; named and skipped groups show thumbnails and counts and can be named later', async ({
  page,
}) => {
  await setup(page);
  const original = (await snapshot(page)).rooms[0].unsortedPhotos;
  await group(page, [2, 1]);
  await expect(naming(page).getByRole('img', { name: /Selected photo/ })).toHaveCount(2);
  await expect(naming(page).getByLabel('Item name', { exact: true })).toBeFocused();
  await expect(
    naming(page).getByRole('button', { name: 'Create item', exact: true }),
  ).toBeDisabled();
  expect((await snapshot(page)).items).toHaveLength(0);
  await naming(page).getByLabel('Item name', { exact: true }).fill('  Sofa  ');
  await page.screenshot({ path: 'artifacts/sort-name-mobile.png' });
  // Rapid repeated taps cannot create duplicate groups.
  await naming(page)
    .getByRole('button', { name: 'Create item', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(naming(page)).not.toBeVisible();
  const sofa = groupCards(page).getByRole('button', { name: 'Sofa 2 photos', exact: true });
  await expect(sofa).toBeVisible();
  await expect(sofa.locator('img')).toBeVisible();
  expect((await snapshot(page)).items[0].photos).toEqual(original.slice(0, 2));
  expect((await snapshot(page)).items[0].name).toBe('Sofa');
  await group(page, [1]);
  await naming(page).getByRole('button', { name: 'Name later', exact: true }).click();
  await expect(
    groupCards(page).getByRole('button', { name: 'Item 2 1 photo', exact: true }),
  ).toBeVisible();
  await expect(groupCards(page).locator('img')).toHaveCount(2);
  const skipped = (await snapshot(page)).items[1];
  expect(skipped.name).toBe('');
  expect(skipped.reviewed).toBe(false);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Add name for Item 2', exact: true }).click();
  await naming(page).getByLabel('Item name', { exact: true }).fill('Floor lamp');
  for (const control of [
    naming(page).getByLabel('Item name'),
    naming(page).getByRole('button', { name: 'Save name' }),
    naming(page).getByRole('button', { name: 'Name later' }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(568);
  }
  await page.screenshot({ path: 'artifacts/sort-name-320.png' });
  await naming(page).getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(naming(page)).not.toBeVisible();
  await page.reload();
  await expect(
    groupCards(page).getByRole('button', { name: 'Floor lamp 1 photo', exact: true }),
  ).toBeAttached();
  await expect(
    groupCards(page).getByRole('button', { name: 'Sofa 2 photos', exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).items[1]).toMatchObject({
    id: skipped.id,
    name: 'Floor lamp',
    photos: skipped.photos,
    reviewed: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/sort-groups-320.png' });
});

test('cancelling keeps the selection, a failed name save keeps the draft, and undo restores capture order', async ({
  page,
}) => {
  await setup(page);
  const before = await snapshot(page);
  await group(page, [4, 2]);
  await naming(page).getByRole('button', { name: 'Back to sorting', exact: true }).click();
  await expect(naming(page)).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Photo 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Photo 4', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Group 2 photos', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(naming(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Group 2 photos', exact: true }).click();
  await naming(page).getByLabel('Item name', { exact: true }).fill('Dining chair');
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
  await naming(page).getByRole('button', { name: 'Name later', exact: true }).click();
  await expect(naming(page).getByRole('alert')).toContainText('Storage is full');
  await expect(naming(page).getByLabel('Item name', { exact: true })).toHaveValue('Dining chair');
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(() => (window as any).restorePut());
  await naming(page).getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(
    groupCards(page).getByRole('button', { name: 'Dining chair 2 photos', exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('4 left to sort', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test('appending preserves the item name and undo restores photos and review status', async ({
  page,
}) => {
  await setup(page);
  const sortURL = page.url();
  await group(page, [1]);
  await naming(page).getByLabel('Item name', { exact: true }).fill('Sofa');
  await naming(page).getByRole('button', { name: 'Create item', exact: true }).click();
  await groupCards(page).getByRole('button', { name: 'Sofa 1 photo', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save reviewed record', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sofa', exact: true })).toBeVisible();
  const before = await snapshot(page);
  expect(before.items[0].reviewed).toBe(true);
  await page.goto(sortURL);
  await select(page, [3, 1]);
  await page.getByRole('combobox', { name: 'Group destination' }).selectOption({ label: 'Sofa' });
  await page.getByRole('button', { name: 'Add to item', exact: true }).click();
  await expect(
    groupCards(page).getByRole('button', { name: 'Sofa 3 photos', exact: true }),
  ).toBeVisible();
  await expect(naming(page)).not.toBeVisible();
  const after = await snapshot(page);
  expect(after.items).toHaveLength(1);
  expect(after.items[0]).toMatchObject({ name: 'Sofa', reviewed: false });
  expect(after.items[0].photos).toEqual([
    before.items[0].photos[0],
    before.rooms[0].unsortedPhotos[0],
    before.rooms[0].unsortedPhotos[2],
  ]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    groupCards(page).getByRole('button', { name: 'Sofa 1 photo', exact: true }),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});
