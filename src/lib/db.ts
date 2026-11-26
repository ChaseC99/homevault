import { openDB, type DBSchema } from 'idb';
import { emptyInventory, type Inventory, type Asset } from './model';
interface VaultDB extends DBSchema {
  state: { key: string; value: Inventory };
  assets: { key: string; value: Asset };
}
let connection: ReturnType<typeof openDB<VaultDB>> | undefined;
const database = () =>
  (connection ??= openDB<VaultDB>('jigsaw-homevault', 1, {
    upgrade(db) {
      db.createObjectStore('state');
      db.createObjectStore('assets', { keyPath: 'id' });
    },
    terminated() {
      connection = undefined;
    },
  }));
export async function loadInventory() {
  return (await (await database()).get('state', 'inventory')) ?? emptyInventory();
}
export async function mutate(change: (data: Inventory) => void, assets: Asset[] = []) {
  const db = await database();
  const tx = db.transaction(['state', 'assets'], 'readwrite');
  try {
    const data = (await tx.objectStore('state').get('inventory')) ?? emptyInventory();
    change(data);
    for (const asset of assets) await tx.objectStore('assets').put(asset);
    await tx.objectStore('state').put(data, 'inventory');
    await tx.done;
    window.dispatchEvent(new Event('vault-change'));
    return data;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    await tx.done.catch(() => {});
    throw e;
  }
}
export async function getAsset(id: string) {
  return (await database()).get('assets', id);
}
export async function storageInfo() {
  const estimate = await navigator.storage?.estimate?.();
  const persistent = await navigator.storage?.persisted?.();
  return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0, persistent: !!persistent };
}
export async function requestPersistence() {
  return (await navigator.storage?.persist?.()) ?? false;
}
export function errorMessage(error: unknown) {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
    ? 'Storage is full. This change was not saved. Free device space, then try again.'
    : error instanceof Error
      ? error.message
      : 'Could not save. Your previous data is unchanged. Please try again.';
}
