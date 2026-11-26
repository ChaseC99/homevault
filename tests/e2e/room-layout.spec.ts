import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function seed(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('jigsaw-homevault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('state', 'readwrite');
          const property = (id: string, name: string) => ({
            id,
            name,
            address: '',
            clientName: '',
            clientPhone: '',
            clientEmail: '',
            insurer: '',
            policyNumber: '',
            agentName: '',
            agentPhone: '',
            walkthroughStartDate: '',
            walkthroughEndDate: '',
            createdAt: '',
            updatedAt: '',
          });
          const room = (id: string, propertyId: string, name: string) => ({
            id,
            propertyId,
            name,
            type: name,
            order: 0,
            roomPhotos: [],
            unsortedPhotos: [],
          });
          tx.objectStore('state').put(
            {
              version: 1,
              properties: [property('first', 'First home'), property('second', 'Nguyen residence')],
              rooms: [
                room('first-room', 'first', 'Office'),
                room('living', 'second', 'Living Room'),
                room('bedroom', 'second', 'Bedroom'),
              ],
              items: [],
              organizer: { name: '', business: '', email: '', phone: '' },
            },
            'inventory',
          );
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event('vault-change'));
            resolve();
          };
        };
      }),
  );
}

async function populate(page: Page) {
  const bytes = [...(await readFile(path.resolve('tests/fixtures/photo-3.jpg')))];
  await page.evaluate(
    (bytes) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('jigsaw-homevault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['state', 'assets'], 'readwrite');
          const state = tx.objectStore('state');
          const query = state.get('inventory');
          query.onsuccess = () => {
            const inventory = query.result;
            const room = inventory.rooms.find((room: any) => room.id === 'living');
            const ids = [
              'overview-1',
              'overview-2',
              'overview-3',
              'overview-4',
              'unsorted-1',
              'unsorted-2',
              'unsorted-3',
              'item-photo',
            ];
            for (const id of ids) {
              const original = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
              tx.objectStore('assets').put({
                id,
                original,
                thumbnail: original,
                width: 1600,
                height: 1200,
                name: id,
                type: 'image/jpeg',
                capturedAt: '',
              });
            }
            room.roomPhotos = ids.slice(0, 4);
            room.unsortedPhotos = ids.slice(4, 7);
            inventory.items = [
              'Reviewed chair',
              'Sofa',
              'End table',
              'Coffee table',
              'Floor lamp',
              'Area rug',
            ].map((name, index) => ({
              id: `item-${index}`,
              roomId: 'living',
              photos: ['item-photo'],
              name,
              category: '',
              brand: '',
              model: '',
              serialNumber: '',
              quantity: 1,
              unitPriceCents: index === 0 ? 987000 : null,
              purchaseDate: '',
              store: '',
              condition: '',
              notes: '',
              reviewed: index === 0,
              receipts: [],
              createdAt: '',
            }));
            state.put(inventory, 'inventory');
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event('vault-change'));
            resolve();
          };
        };
      }),
    bytes,
  );
}

test.beforeAll(() => mkdir('artifacts', { recursive: true }));

test('camera follows room and property context, and the picker clears a room when property changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Synthetic camera denial', 'NotAllowedError');
      },
    });
  });
  await seed(page);
  await expect(page.locator('.header-meta')).toHaveCount(0);
  await expect(page.getByText('Development preview', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Nguyen residence/ }).click();
  await expect(page.getByText('Address not recorded')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take photos at Nguyen residence' }).click();
  await expect(page.getByRole('combobox', { name: 'Property', exact: true })).toHaveValue('second');
  await expect(page.getByRole('combobox', { name: 'Room', exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Property', exact: true })).toHaveValue('second');
  await page.getByRole('combobox', { name: 'Room', exact: true }).selectOption('living');
  await page.getByRole('combobox', { name: 'Property', exact: true }).selectOption('first');
  await expect(page.getByRole('combobox', { name: 'Room', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Property', exact: true }).selectOption('second');
  await page.getByRole('combobox', { name: 'Room', exact: true }).selectOption('bedroom');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.camera-title h1')).toHaveText('Bedroom');
  await expect(page.getByRole('button', { name: 'Take item photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Take photos in Bedroom', exact: true }).click();
  await expect(page.locator('.camera-title h1')).toHaveText('Bedroom');
  await expect(page.getByRole('heading', { name: 'Choose a room' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Nguyen residence', exact: true }).click();
  await page.getByRole('button', { name: 'Take photos at Nguyen residence' }).click();
  await expect(page.getByRole('combobox', { name: 'Room', exact: true })).toHaveValue('');
});

test('room reference layout supports empty, covered and pending states, cover changes, and rename', async ({
  page,
}) => {
  await seed(page);
  await page.goto('./#/room/living');
  await expect(page.getByText('No photos yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overview · 0' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add overview shots', exact: true })).toBeVisible();
  await expect(
    page.locator('.room-empty').getByRole('button', { name: 'Add items' }),
  ).toBeVisible();
  await expect(page.locator('.nav-camera-label')).toHaveText('Living Room');
  await page.screenshot({ path: 'artifacts/room-reference-empty.png' });
  await populate(page);
  await expect(page.locator('.room-hero img')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overview · 4' })).toBeVisible();
  await expect(page.locator('.cover-badge')).toHaveCount(1);
  await expect(page.locator('.room-tasks > button')).toHaveCount(2);
  await expect(page.locator('.room-items .list-row').first()).toContainText('Sofa');
  await expect(page.locator('.room-items .list-row').last()).toContainText('Reviewed chair');
  await expect(page.locator('.room-heading p')).toHaveText('6 items · $9,870.00 documented');
  await page.screenshot({ path: 'artifacts/room-reference-populated.png' });
  await page.getByRole('button', { name: 'Overview photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Make room cover', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Room overview photo' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current cover', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move to item photos for sorting' }).click();
  await expect(page.getByRole('heading', { name: 'Overview · 3' })).toBeVisible();
  await expect(page.locator('.room-hero img')).toBeVisible();
  await expect(page.getByRole('button', { name: /4 photos to sort/ })).toBeVisible();
  await page.getByRole('button', { name: 'Room options', exact: true }).click();
  await page.getByRole('button', { name: 'Rename room', exact: true }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Family Room');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Family Room', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take photos in Family Room' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const nav = page.getByRole('navigation', { name: 'Page navigation' });
  expect((await nav.boundingBox())!.y).toBe(0);
  await expect(nav.getByRole('button', { name: 'Nguyen residence' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function inventoryState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('jigsaw-homevault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['state', 'assets']);
          const inventory = tx.objectStore('state').get('inventory');
          const assets = tx.objectStore('assets').getAllKeys();
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            resolve({ inventory: inventory.result, assets: assets.result });
            db.close();
          };
        };
      }),
  );
}

test('property edit omits insurance and keeps date inputs inside their card', async ({ page }) => {
  await seed(page);
  await page.goto('./#/property/second');
  await expect(page.getByLabel('Add cover photo', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Change cover', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insurance', exact: true })).toHaveCount(0);
  await page.getByLabel('Started', { exact: true }).fill('2026-11-21');
  await page.getByLabel('Finished', { exact: true }).fill('2026-11-26');
  for (const width of [320, 390, 540, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ['Started', 'Finished']) {
      const field = page.getByLabel(label, { exact: true });
      const bounds = await field.evaluate((input) => {
        const card = input.closest('.form-card')!;
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        const own = input.getBoundingClientRect();
        return {
          left: own.left,
          right: own.right,
          min: rect.left + parseFloat(style.paddingLeft),
          max: rect.right - parseFloat(style.paddingRight),
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.min);
      expect(bounds.right).toBeLessThanOrEqual(bounds.max);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Started', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/edit-dates-contained.png' });
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nguyen residence', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Started', { exact: true })).toHaveValue('2026-11-21');
  await expect(page.getByLabel('Finished', { exact: true })).toHaveValue('2026-11-26');
});

test('property cover changes are available only on the edit page and survive reload', async ({
  page,
}) => {
  await seed(page);
  await page.goto('./#/property/second');
  await expect(page.locator('.property-cover input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Choose exterior photo', { exact: true })
    .setInputFiles(path.resolve('tests/fixtures/photo-3.jpg'));
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.locator('.property-cover img')).toBeVisible();
  await page.reload();
  await expect(page.locator('.property-cover input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Change cover photo', { exact: true })).toBeAttached();
});

test('room spacing aligns and fullscreen photos restore the white bar and page position', async ({
  page,
}) => {
  await seed(page);
  await populate(page);
  await page.goto('./#/room/living');
  await expect(page.getByText('Needs details first', { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const overview = (await page.locator('.room-overview').boundingBox())!;
    const items = (await page.locator('.room-inventory').boundingBox())!;
    const tasks = (await page.locator('.room-tasks').boundingBox())!;
    const heading = (await page.locator('.room-heading').boundingBox())!;
    for (const box of [items, tasks, heading]) {
      expect(box.x).toBe(overview.x);
      expect(box.width).toBe(overview.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/room-spacing-mobile.png' });
  await page.evaluate(() => window.scrollTo(0, 120));
  const before = await page.evaluate(() => scrollY);
  await expect(page.getByRole('navigation', { name: 'Page navigation' })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#10140f');
  await page
    .getByRole('dialog', { name: 'Room overview photo' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
  await expect(page.getByRole('navigation', { name: 'Page navigation' })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await page
    .locator('.room-items-heading')
    .getByRole('button', { name: 'Add items', exact: true })
    .click();
  await expect(page.locator('.camera-title h1')).toHaveText('Living Room');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // The same gutter applies on setup, record, sorting and report screens.
  for (const route of [
    '/property/second',
    '/edit-property/second',
    '/rooms/second',
    '/item/item-0',
    '/details/item-0',
    '/sort/living',
    '/reports/second',
  ]) {
    await page.goto(`./#${route}`);
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const header = (await page.locator('main header').first().boundingBox())!;
    expect(header.x).toBe(18);
  }
});

test('room and property menus require confirmation, survive failed deletion, and delete only their contents', async ({
  page,
}) => {
  await seed(page);
  await populate(page);
  await page.goto('./#/room/living');
  const before = await inventoryState(page);
  await page.getByRole('button', { name: 'Room options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete room', exact: true }).click();
  const roomDialog = page.getByRole('dialog', { name: 'Delete room?', exact: true });
  await expect(roomDialog).toContainText('Living Room');
  await expect(roomDialog).toContainText('6 items');
  await expect(roomDialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await roomDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await inventoryState(page)).toEqual(before);
  await page.getByRole('button', { name: 'Room options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete room', exact: true }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state') throw Error('Synthetic deletion failure');
      return put.call(this, value, key!);
    };
    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = put;
    };
  });
  await roomDialog.getByRole('button', { name: 'Delete room', exact: true }).click();
  await expect(roomDialog.getByRole('alert')).toContainText('Synthetic deletion failure');
  expect(await inventoryState(page)).toEqual(before);
  await page.evaluate(() => (window as any).restorePut());
  await roomDialog.getByRole('button', { name: 'Delete room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nguyen residence', exact: true })).toBeVisible();
  await page.reload();
  const afterRoom = await inventoryState(page);
  expect(afterRoom.inventory.rooms.map((r: any) => r.id)).toEqual(['first-room', 'bedroom']);
  expect(afterRoom.inventory.items).toEqual([]);
  expect(afterRoom.assets).toEqual([]);
  await page.getByRole('button', { name: 'Property options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete property', exact: true }).click();
  const propertyDialog = page.getByRole('dialog', { name: 'Delete property?', exact: true });
  await expect(propertyDialog).toContainText('Nguyen residence');
  await expect(
    propertyDialog.getByRole('button', { name: 'Delete property', exact: true }),
  ).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  expect(await inventoryState(page)).toEqual(afterRoom);
  await page.getByRole('button', { name: 'Property options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete property', exact: true }).click();
  await page.screenshot({ path: 'artifacts/delete-property-confirmation.png' });
  await propertyDialog.getByRole('button', { name: 'Delete property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await page.reload();
  const afterProperty = await inventoryState(page);
  expect(afterProperty.inventory.properties.map((p: any) => p.id)).toEqual(['first']);
  expect(afterProperty.inventory.rooms.map((r: any) => r.id)).toEqual(['first-room']);
  expect(afterProperty.inventory.organizer).toEqual(before.inventory.organizer);
});
