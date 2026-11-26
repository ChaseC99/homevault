import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  emptyInventory,
  newRoom,
  newItem,
  groupPhotos,
  captureItemPhoto,
  stats,
  parsePrice,
  itemTotal,
  validateItem,
} from '../src/lib/model';
import { parseReceipt } from '../src/lib/receipt-parser';
import { mutate, loadInventory, getAsset } from '../src/lib/db';
globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
describe('inventory invariants', () => {
  it('prices each unit exactly once, includes draft values and excludes unknowns', () => {
    const d = emptyInventory(),
      r = newRoom('p', 'Bedroom', []);
    d.rooms = [r];
    const a = newItem(r.id, ['a']),
      b = newItem(r.id, ['b']);
    a.unitPriceCents = 38000;
    a.quantity = 2;
    d.items = [a, b];
    expect(itemTotal(a)).toBe(76000);
    expect(stats(d, 'p').total).toBe(76000);
    expect(stats(d, 'p').unknown).toBe(1);
    expect(stats(d, 'p').ready).toBe(false);
    a.reviewed = b.reviewed = true;
    expect(stats(d, 'p').ready).toBe(true);
    r.unsortedPhotos = ['c'];
    expect(stats(d, 'p').ready).toBe(false);
  });
  it('auto-numbers by type while avoiding existing names', () => {
    const one = newRoom('p', 'Bedroom', []);
    one.name = 'Primary Bedroom';
    const two = newRoom('p', 'Bedroom', [one]);
    expect(two.name).toBe('Bedroom 2');
    const three = newRoom('p', 'Bedroom', [one, two]);
    expect(three.name).toBe('Bedroom 3');
    const recreated = newRoom('p', 'Bedroom', [one, three]);
    expect(recreated.name).toBe('Bedroom 4');
  });
  it('groups in capture order, removes only selected photos, and supports existing records', () => {
    const d = emptyInventory(),
      r = newRoom('p', 'Kitchen', []);
    r.unsortedPhotos = ['a', 'b', 'c'];
    d.rooms = [r];
    const key = groupPhotos(d, r.id, ['c', 'a']);
    expect(d.items[0].photos).toEqual(['a', 'c']);
    expect(r.unsortedPhotos).toEqual(['b']);
    d.items[0].reviewed = true;
    groupPhotos(d, r.id, ['b'], key);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].reviewed).toBe(false);
    expect(r.unsortedPhotos).toEqual([]);
  });
  it('never marks an empty property ready', () =>
    expect(stats(emptyInventory()).ready).toBe(false));
  it('captures consecutive photos into an item without adding overview or unsorted photos', () => {
    const d = emptyInventory();
    const room = newRoom('p', 'Office', []);
    d.rooms.push(room);
    const first = captureItemPhoto(d, room.id, 'front');
    captureItemPhoto(d, room.id, 'label', first);
    captureItemPhoto(d, room.id, 'next');
    expect(d.items.map((i) => i.photos)).toEqual([['front', 'label'], ['next']]);
    expect(d.items.every((i) => !i.reviewed && i.unitPriceCents === null)).toBe(true);
    expect(room.unsortedPhotos).toEqual([]);
    expect(room.roomPhotos).toEqual([]);
    const other = newRoom('p', 'Kitchen', d.rooms);
    d.rooms.push(other);
    expect(() => captureItemPhoto(d, other.id, 'wrong-room', first)).toThrow();
    expect(() => captureItemPhoto(d, 'missing-room', 'photo')).toThrow();
    expect(d.items[0].photos).toEqual(['front', 'label']);
  });
  it('rejects invalid money and quantities; preserves unknown vs zero', () => {
    expect(parsePrice('')).toBe(null);
    expect(parsePrice('0')).toBe(0);
    expect(parsePrice('19.99')).toBe(1999);
    for (const value of ['-1', 'abc', '1.234', 'Infinity'])
      expect(() => parsePrice(value)).toThrow();
    const item = newItem('r', []);
    item.quantity = 1.5;
    expect(() => validateItem(item)).toThrow();
  });
});
describe('receipt interpretation', () => {
  it('extracts US dates, store, and total but does not infer unit price', () => {
    expect(parseReceipt('HOME GOODS\n11/21/2026\nSUBTOTAL 70.00\nTAX 5.00\nTOTAL $75.00')).toEqual({
      store: 'HOME GOODS',
      date: '2026-11-21',
      amount: 7500,
    });
  });
  it('keeps missing and impossible fields absent', () => {
    expect(parseReceipt('02/31/2024\nSUBTOTAL 5.00\nTAX 0.30')).not.toHaveProperty('date');
    expect(parseReceipt('')).toEqual({ store: undefined });
    expect(parseReceipt('SHOP\nSUBTOTAL 5.00')).not.toHaveProperty('amount');
  });
});
describe('atomic persistence', () => {
  beforeEach(async () => {
    await mutate((d) => Object.assign(d, emptyInventory()));
  });
  it('persists metadata and original bytes in the same transaction', async () => {
    const blob = new Blob(['original']);
    await mutate(
      (d) => d.rooms.push(newRoom('p', 'Office', [])),
      [
        {
          id: 'asset',
          original: blob,
          thumbnail: null,
          width: 0,
          height: 0,
          name: 'original',
          type: 'image/png',
          capturedAt: '',
        },
      ],
    );
    expect((await loadInventory()).rooms).toHaveLength(1);
    expect(await (await getAsset('asset'))!.original.text()).toBe('original');
  });
  it('rolls back a failed mutation', async () => {
    await expect(
      mutate((d) => {
        d.rooms.push(newRoom('p', 'Office', []));
        throw Error('failure');
      }),
    ).rejects.toThrow('failure');
    expect((await loadInventory()).rooms).toEqual([]);
  });
  it('does not lose simultaneous mutations', async () => {
    await Promise.all([
      mutate((d) => d.rooms.push(newRoom('p', 'Office', d.rooms))),
      mutate((d) => d.rooms.push(newRoom('p', 'Office', d.rooms))),
    ]);
    expect((await loadInventory()).rooms.map((r) => r.name)).toEqual(['Office', 'Office 2']);
  });
});
