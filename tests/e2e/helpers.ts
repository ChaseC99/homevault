import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import type { Inventory } from '../../src/lib/model';

export const fixture = (name: string) => path.resolve('tests/fixtures', name);

export async function snapshot(page: Page): Promise<Inventory> {
  return page.evaluate(
    () =>
      new Promise<Inventory>((resolve, reject) => {
        const request = indexedDB.open('jigsaw-homevault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('state');
          const query = tx.objectStore('state').get('inventory');
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            db.close();
            resolve(query.result);
          };
        };
      }),
  );
}

// Start from the home page so each scenario still exercises real creation and persistence.
export async function createRoom(page: Page) {
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Oak residence');
  await page.getByLabel('Street, city, state and ZIP').fill('123 Example Lane\nPortland, OR 97201');
  await page.getByLabel('Client / policyholder name').fill('Sample client');
  await page
    .getByLabel('Choose exterior photo', { exact: true })
    .setInputFiles(fixture('photo-3.jpg'));
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await page.getByRole('button', { name: 'Add rooms', exact: true }).first().click();
  await page.getByRole('button', { name: 'Living Room None yet', exact: true }).click();
  await page.getByRole('button', { name: 'Add 1 room', exact: true }).click();
  await page.getByRole('button', { name: 'Living Room Not photographed yet' }).click();
}

export async function importPhotos(page: Page, names: string[]) {
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

export async function failWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'state')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return put.call(this, value, key!);
    };
    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = put;
    };
  });
}

export async function restoreWrites(page: Page) {
  await page.evaluate(() => (window as any).restorePut());
}

// Offline readiness lives in Settings; inspect the worker without adding a badge to Home.
export async function waitForOffline(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const worker = (await navigator.serviceWorker.getRegistration())?.active;
          if (!worker) return false;
          return new Promise<boolean>((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => {
              channel.port1.close();
              resolve(false);
            }, 2000);
            channel.port1.onmessage = (event) => {
              clearTimeout(timer);
              channel.port1.close();
              resolve(event.data.ready === true);
            };
            worker.postMessage({ type: 'CHECK_READY', repair: false }, [channel.port2]);
          });
        }),
      { timeout: 90000 },
    )
    .toBe(true);
}
