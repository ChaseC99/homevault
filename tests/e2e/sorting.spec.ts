import { test, expect, type Page } from '@playwright/test';
import { createRoom, failWrites, fixture, importPhotos, restoreWrites, snapshot } from './helpers';

const cards = (page: Page) => page.getByRole('list', { name: 'Labeled items' });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save & return to photos', exact: true });
const grid = (page: Page) => page.getByRole('heading', { name: 'Label photos', exact: true });
async function select(page: Page, photos: number[]) {
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  for (const photo of photos)
    await page.getByRole('button', { name: `Select photo ${photo}`, exact: true }).click();
}
async function setup(page: Page) {
  await page.goto('./');
  await createRoom(page);
  await page.locator('.room-empty').getByRole('button', { name: 'Add items', exact: true }).click();
  await importPhotos(
    page,
    [1, 2, 3, 4].map((n) => `photo-${n}.jpg`),
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(grid(page)).toBeVisible();
}

test('labeling saves a draft, permits blanks, and ignores duplicate taps', async ({ page }) => {
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
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('Sofa');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => scrollTo(0, 0));
  const button = (await save(page).boundingBox())!;
  const nameField = (await page.getByLabel('Item name', { exact: true }).boundingBox())!;
  expect(nameField.y + nameField.height).toBeLessThanOrEqual(button.y);
  expect(button.y).toBeGreaterThanOrEqual(0);
  expect(button.y + button.height).toBeLessThanOrEqual(568);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save(page).click();
  await expect(grid(page)).toBeVisible();
});

test('finishing the last photos returns to the room with a toast only after the item saves', async ({
  page,
}) => {
  await setup(page);
  await select(page, [1, 2, 3, 4]);
  await page.getByRole('button', { name: 'Label 4 photos as one item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Label this item', exact: true })).toBeVisible();
  await expect(page.locator('.editable-photo')).toHaveCount(4);
  await failWrites(page);
  await page.getByLabel('Item name', { exact: true }).fill('Sofa');
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('Sofa');
  await restoreWrites(page);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'All photos are labeled' }),
  ).toBeVisible();
  await expect(page.locator('.room-items-heading .room-item-count')).toHaveText('1');
  expect((await snapshot(page)).items[0]).toMatchObject({ name: 'Sofa' });
  await page.reload();
  await expect(page.getByText('All photos are labeled', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add Item', exact: true }).click();
  await importPhotos(page, ['photo-1.jpg']);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await select(page, [1]);
  await page.getByRole('combobox', { name: 'Add photos to' }).selectOption({ label: 'Sofa' });
  await page.getByRole('button', { name: 'Add to item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'All photos are labeled' }),
  ).toBeVisible();
  expect((await snapshot(page)).items[0].photos).toHaveLength(5);

  await page.getByRole('button', { name: 'Add Item', exact: true }).click();
  await importPhotos(page, ['photo-2.jpg']);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await select(page, [1]);
  await page.getByRole('button', { name: 'These are room overview photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Room overview photos saved' }),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
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
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByRole('link', { name: 'Jigsaw Homevault home' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is full');
  await expect(page).toHaveURL(/#\/sort\/[^?]+\?item=/);
  await restoreWrites(page);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByLabel('Purchase price per unit (USD)').fill('invalid');
  await page.getByRole('button', { name: 'Photo grid', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('non-negative price');
  await expect(grid(page)).toHaveCount(0);
  await page.getByLabel('Purchase price per unit (USD)').fill('');
  await save(page).click();
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items).toHaveLength(1);
  expect((await snapshot(page)).items[0].notes).toBe('Keep this unsaved note');
  await cards(page)
    .getByRole('button', { name: /Draft sofa/ })
    .click();
  await page.getByLabel('Item name', { exact: true }).fill('Saved by browser Back');
  await page.evaluate(() => history.back());
  await expect(grid(page)).toBeVisible();
  expect((await snapshot(page)).items[0].name).toBe('Saved by browser Back');
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

test('item pages support category suggestions, photo import, room photo selection and cover selection', async ({
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
  await page.getByLabel('Category', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'Furniture', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Jewelry', exact: true })).toBeVisible();
  await page.getByLabel('Category', { exact: true }).press('ArrowDown');
  await page.getByLabel('Category', { exact: true }).press('Enter');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Furniture');
  await page.getByLabel('Category', { exact: true }).fill('Collectibles');
  await page.getByRole('option', { name: 'Add “Collectibles”', exact: true }).click();
  const initial = (await snapshot(page)).items[0].photos;
  await page.getByRole('button', { name: 'Remove item photo 1', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  expect((await snapshot(page)).items[0].photos).toEqual(initial);
  await page.getByRole('button', { name: 'Remove item photo 2', exact: true }).click();
  await expect(page.locator('.editable-photo')).toHaveCount(1);
  await page.getByLabel('Brand', { exact: true }).fill('New brand');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('New brand');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Collectibles');
  await page.getByLabel('Category', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'Collectibles', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.editable-photo')).toHaveCount(1);
  await page.getByLabel('Add item photos', { exact: true }).setInputFiles(fixture('photo-4.jpg'));
  await expect(page.locator('.editable-photo')).toHaveCount(2);
  const photos = (await snapshot(page)).items[0].photos;
  await page.getByRole('button', { name: 'Open item photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Make Cover', exact: true }).click();
  expect((await snapshot(page)).items[0].photos[0]).toBe(photos[1]);
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  expect((await snapshot(page)).items[0].brand).toBe('New brand');
  await page.getByRole('button', { name: /Lamp 2 photos/ }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Move to another room', exact: true }).click();
  const moveSheet = page.getByRole('dialog', { name: 'Move to another room', exact: true });
  await moveSheet.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect(moveSheet.getByRole('alert')).toContainText('Quantity must be a whole number');
  await moveSheet.getByRole('button', { name: 'Close move to another room' }).click();
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Living Room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
});
