import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
const fixture = (name: string) => path.resolve('tests/fixtures', name);
async function state(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const request = indexedDB.open('jigsaw-homevault');
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
async function item(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Feedback home');
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await page.getByRole('button', { name: 'Add rooms', exact: true }).first().click();
  await page.getByRole('button', { name: 'Living Room None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 room', exact: true }).click();
  await page.getByRole('button', { name: 'Living Room Not photographed yet', exact: true }).click();
  // The empty state itself must offer a working capture action.
  await page.locator('.empty').getByRole('button', { name: 'Add items', exact: true }).click();
  await page.getByRole('button', { name: 'More camera options', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Camera options' })
    .getByLabel('Import photos')
    .setInputFiles([fixture('photo-1.jpg'), fixture('photo-2.jpg')]);
  await expect(page.locator('.capture-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Group 2 photos', exact: true }).click();
  await page.getByRole('button', { name: 'Name later', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Everything has a place.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await page.getByRole('button', { name: /Item 1 2 photos/ }).click();
}

test('mobile setup keeps dates, pending rooms, and back navigation accessible; GPS stays separate', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 45.52, longitude: -122.68, accuracy: 12 });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insurance', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Street, city, state and ZIP')).toHaveAttribute(
    'autocomplete',
    'street-address',
  );
  await page.getByLabel('Property name', { exact: true }).fill('Location home');
  await page.getByLabel('Street, city, state and ZIP').fill('123 Example Lane');
  await page.getByRole('button', { name: 'Add current location', exact: true }).click();
  await expect(page.getByText(/GPS: 45.52000, -122.68000/)).toBeVisible();
  await expect(page.getByLabel('Street, city, state and ZIP')).toHaveValue('123 Example Lane');
  await page.getByLabel('Started', { exact: true }).fill('2026-11-21');
  await page.getByLabel('Finished', { exact: true }).fill('2026-11-26');
  const start = await page.getByLabel('Started', { exact: true }).boundingBox();
  const finish = await page.getByLabel('Finished', { exact: true }).boundingBox();
  expect(finish!.y).toBeGreaterThanOrEqual(start!.y + start!.height);
  expect(start!.x + start!.width).toBeLessThanOrEqual(320);
  expect(finish!.x + finish!.width).toBeLessThanOrEqual(320);
  const navigation = page.getByRole('navigation', { name: 'Page navigation' });
  expect((await navigation.boundingBox())!.y).toBe(0);
  await page.screenshot({ path: 'artifacts/setup-dates-320.png' });
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  expect((await state(page)).properties[0].location).toEqual({
    latitude: 45.52,
    longitude: -122.68,
    accuracy: 12,
  });
  // One home illustration; no image placeholder underneath it.
  await expect(page.locator('.property-cover .photo svg')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add rooms', exact: true }).first().click();
  await page.getByRole('button', { name: 'Living Room None yet', exact: true }).click();
  const pending = page.getByRole('region', { name: 'Pending rooms' });
  const box = await pending.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(68);
  expect(box!.y + box!.height).toBeLessThan(568);
  await expect(pending.getByText('Living Room', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bedroom None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Bedroom 1 in home', exact: true }).click();
  await expect(pending.getByText('Bedroom 2', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/pending-rooms-320.png' });
  await pending.getByRole('button', { name: 'Remove Bedroom 2', exact: true }).click();
  await page.getByRole('button', { name: 'Add 2 rooms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/GPS: 45.52000/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Remove location', exact: true }).click();
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  expect((await state(page)).properties[0].location).toBeUndefined();
});

test('denied location leaves address entry usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({
        code: 1,
        message: 'denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
  await page.goto('./#/new');
  await page.getByLabel('Street, city, state and ZIP').fill('Manual address');
  await page.getByRole('button', { name: 'Add current location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Location permission is off');
  await expect(page.getByLabel('Street, city, state and ZIP')).toHaveValue('Manual address');
});

test('item editing supports custom categories, photo removal and undo, serial OCR, and a single-unit receipt', async ({
  page,
}) => {
  await item(page);
  await expect(page.getByText('Not recorded', { exact: true })).toHaveCount(0);
  await expect(page.locator('dd').filter({ hasText: /^-$/ })).toHaveCount(9);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  expect(
    await page
      .locator('#item-categories option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
  ).toEqual(['Furniture', 'Electronics', 'Art', 'Decor', 'Appliances', 'Jewelry']);
  await page.getByLabel('Category', { exact: true }).fill('Collectibles');
  const initial = (await state(page)).items[0].photos;
  await page.getByRole('button', { name: 'Remove item photo 1', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  expect((await state(page)).items[0].photos).toEqual(initial);
  await page.getByRole('button', { name: 'Remove item photo 2', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Item 1', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Collectibles');
  await expect(page.locator('#item-categories option[value="Collectibles"]')).toHaveCount(1);
  await expect(page.locator('.editable-photo')).toHaveCount(1);
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
    .getByLabel('Attach image or PDF', { exact: true })
    .setInputFiles(fixture('receipt.png'));
  await expect(page.getByText('Receipt total: $760.00', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByRole('button', { name: 'Divide by 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use as unit price' }).click();
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue(
    '760.00',
  );
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View receipt 1' }).getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: 'View receipt 1' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Receipt 1' })
      .getByRole('img', { name: 'Receipt 1, page 1', exact: true }),
  ).toBeVisible();
});
