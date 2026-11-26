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
function assetIds(data: Inventory) {
  return new Set([
    ...data.properties.flatMap((property) => (property.coverPhoto ? [property.coverPhoto] : [])),
    ...data.rooms.flatMap((room) => [...room.roomPhotos, ...room.unsortedPhotos]),
    ...data.items.flatMap((item) => [
      ...item.photos,
      ...item.receipts.map((receipt) => receipt.assetId),
    ]),
  ]);
}
async function commit(change: (data: Inventory) => void, assets: Asset[], removeAssets = false) {
  const db = await database();
  const tx = db.transaction(['state', 'assets'], 'readwrite');
  try {
    const data = (await tx.objectStore('state').get('inventory')) ?? emptyInventory();
    const before = removeAssets ? assetIds(data) : new Set<string>();
    change(data);
    if (removeAssets) {
      const remaining = assetIds(data);
      for (const id of before) if (!remaining.has(id)) await tx.objectStore('assets').delete(id);
    }
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
export function mutate(change: (data: Inventory) => void, assets: Asset[] = []) {
  return commit(change, assets);
}
export function deleteRoom(roomId: string) {
  return commit(
    (data) => {
      if (!data.rooms.some((room) => room.id === roomId)) throw Error('Room no longer exists.');
      data.items = data.items.filter((item) => item.roomId !== roomId);
      data.rooms = data.rooms.filter((room) => room.id !== roomId);
    },
    [],
    true,
  );
}
export function deleteProperty(propertyId: string) {
  return commit(
    (data) => {
      if (!data.properties.some((property) => property.id === propertyId))
        throw Error('Property no longer exists.');
      const rooms = new Set(
        data.rooms.filter((room) => room.propertyId === propertyId).map((room) => room.id),
      );
      data.items = data.items.filter((item) => !rooms.has(item.roomId));
      data.rooms = data.rooms.filter((room) => !rooms.has(room.id));
      data.properties = data.properties.filter((property) => property.id !== propertyId);
    },
    [],
    true,
  );
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
