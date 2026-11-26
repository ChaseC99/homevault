import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { failWrites, fixture, restoreWrites, snapshot } from './helpers';

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

test('rooms support empty and populated inventory, cover changes, and rename', async ({ page }) => {
  await seed(page);
  await page.goto('./#/room/living');
  await expect(page.getByText('No photos yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Room overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add overview shots', exact: true })).toBeVisible();
  await expect(
    page.locator('.room-empty').getByRole('button', { name: 'Add items' }),
  ).toBeVisible();
  await expect(page.locator('.nav-camera-label')).toHaveText('Living Room');
  await populate(page);
  await expect(page.locator('.room-hero img')).toBeVisible();
  await expect(page.locator('.room-overview-heading > span')).toHaveText('4 photos');
  await expect(page.locator('.cover-badge')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Label', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start details', exact: true })).toBeVisible();
  await expect(page.locator('.room-items .list-row').first()).toContainText('Sofa');
  await expect(page.locator('.room-items .list-row').last()).toContainText('Reviewed chair');
  await expect(page.locator('.room-heading p')).toHaveText('6 items · $9,870 documented');
  await page.evaluate(() => window.scrollTo(0, 120));
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Room overview photo' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollBefore);
  await page.getByRole('button', { name: 'Overview photo 2', exact: true }).click();
  await page.getByRole('button', { name: 'Make room cover', exact: true }).click();
  expect((await snapshot(page)).rooms.find((room) => room.id === 'living')!.roomPhotos[0]).toBe(
    'overview-2',
  );
  await expect(page.getByRole('dialog', { name: 'Room overview photo' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Overview photo 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current cover', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move to item photos for labeling' }).click();
  await expect(page.locator('.room-overview-heading > span')).toHaveText('3 photos');
  await expect(page.locator('.room-hero img')).toBeVisible();
  await expect(page.locator('.unlabeled-count')).toHaveText('4unlabeled');

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

test('room filters and actions use live inventory and enter the full labeling and item editors', async ({
  page,
}) => {
  await seed(page);
  await populate(page);
  await page.goto('./#/room/living');
  const all = page.getByRole('button', { name: 'All 6', exact: true });
  const needs = page.getByRole('button', { name: 'Needs details 5', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await needs.focus();
  await page.keyboard.press('Enter');
  await expect(needs).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.room-items .list-row')).toHaveCount(5);
  await expect(page.locator('.room-items')).not.toContainText('Reviewed chair');
  await all.click();
  await expect(page.locator('.room-items .list-row')).toHaveCount(6);
  await page.getByRole('button', { name: 'Start details', exact: true }).click();
  await expect(page).toHaveURL(/\/details\/item-1\?session$/);
  await expect(page.getByLabel('Item name', { exact: true })).toHaveValue('Sofa');
  const drafts = ['Sofa', 'End table', 'Coffee table', 'Floor lamp', 'Area rug'];
  for (const name of drafts) {
    await page.getByLabel('Notes / additional information').fill(`Reviewed draft: ${name}`);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Living Room', exact: true })).toBeVisible();
  const saved = (await snapshot(page)).items.filter((item) => !item.reviewed);
  expect(saved.map((item) => item.notes)).toEqual(drafts.map((name) => `Reviewed draft: ${name}`));
  await page.locator('.room-items .list-row').filter({ hasText: 'Sofa' }).click();
  await expect(page).toHaveURL(/\/item\/item-1$/);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByLabel('Item name', { exact: true }).fill('Blue ottoman');
  await page.getByLabel('Purchase price per unit (USD)', { exact: true }).fill('125.25');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await expect(page.getByRole('button', { name: 'Add item photos', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /Reviewed/ }).check();
  await page.getByRole('button', { name: 'Save & return to room', exact: true }).click();
  await expect(page.locator('.room-heading p')).toHaveText('6 items · $10,120.50 documented');
  await expect(page.locator('.room-items-heading > span')).toHaveText('6 · $10,120.50');
  await expect(page.getByRole('button', { name: 'Needs details 4', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Label', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Label photos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Label photo 1', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Table lamp');
  await expect(page.getByLabel('Purchase price per unit (USD)', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save & return to photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Label photos', exact: true })).toBeVisible();
  await expect(page.getByLabel('Item name', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Living Room', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All 7', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Needs details 5', exact: true })).toBeVisible();
  await expect(page.locator('.unlabeled-count')).toHaveText('2unlabeled');
  await expect(page.locator('.room-heading p')).toHaveText('7 items · $10,120.50 documented');
  await page.reload();
  await expect(page.locator('.room-items')).toContainText('Blue ottoman');
  await expect(page.locator('.room-items')).toContainText('Table lamp');
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
  await failWrites(page);
  await roomDialog.getByRole('button', { name: 'Delete room', exact: true }).click();
  await expect(roomDialog.getByRole('alert')).toContainText('Storage is full');
  expect(await inventoryState(page)).toEqual(before);
  await restoreWrites(page);
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
  await page.keyboard.press('Escape');
  expect(await inventoryState(page)).toEqual(afterRoom);
  await page.getByRole('button', { name: 'Property options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete property', exact: true }).click();
  await propertyDialog.getByRole('button', { name: 'Delete property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await page.reload();
  const afterProperty = await inventoryState(page);
  expect(afterProperty.inventory.properties.map((p: any) => p.id)).toEqual(['first']);
  expect(afterProperty.inventory.rooms.map((r: any) => r.id)).toEqual(['first-room']);
  expect(afterProperty.inventory.organizer).toEqual(before.inventory.organizer);
});

test('mobile setup keeps dates, pending rooms, and back navigation accessible; GPS stays separate', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 45.5200123456,
    longitude: -122.6800987654,
    accuracy: 12,
  });
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
  const map = page.getByRole('link', { name: 'Open in Maps', exact: true });
  await expect(map).toBeVisible();
  const target = new URL((await map.getAttribute('href'))!);
  expect(target.origin + target.pathname).toBe('https://maps.apple.com/place');
  expect(target.searchParams.get('coordinate')).toBe('45.5200123456,-122.6800987654');
  await expect(map).toHaveAttribute('target', '_blank');
  await expect(page.getByText(/GPS:/)).toHaveCount(0);
  // Verify the action opens the exact destination without contacting a mapping service.
  await context.route('https://maps.apple.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: 'Map destination' }),
  );
  const popupPromise = page.waitForEvent('popup');
  await map.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(target.href);
  await popup.close();
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
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  expect((await snapshot(page)).properties[0].location).toEqual({
    latitude: 45.5200123456,
    longitude: -122.6800987654,
    accuracy: 12,
  });
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
  await pending.getByRole('button', { name: 'Remove Bedroom 2', exact: true }).click();
  await page.getByRole('button', { name: 'Add 2 rooms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  await page.reload();
  await expect(map).toHaveAttribute('href', target.href);
  await expect(page.getByText(/45.5200123456/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Started', { exact: true })).toHaveValue('2026-11-21');
  await expect(page.getByLabel('Finished', { exact: true })).toHaveValue('2026-11-26');
  await page
    .getByLabel('Choose exterior photo', { exact: true })
    .setInputFiles(fixture('photo-3.jpg'));
  await page.getByRole('button', { name: 'Remove location', exact: true }).click();
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location home', exact: true })).toBeVisible();
  expect((await snapshot(page)).properties[0].location).toBeUndefined();
  await expect(map).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.property-cover img')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Change cover photo', { exact: true })).toBeAttached();
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
