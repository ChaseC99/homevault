import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  emptyInventory,
  newRoom,
  newItem,
  groupPhotos,
  stats,
  parsePrice,
  itemTotal,
  validateItem,
  title,
  type Property,
} from '../src/lib/model';
import { parseReceipt, parseSerialNumber } from '../src/lib/receipt-parser';
import { mutate, loadInventory, getAsset, deleteRoom, deleteProperty } from '../src/lib/db';
globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
describe('inventory invariants', () => {
  it('prices each unit exactly once, includes draft values and excludes unknowns', () => {
    expect(stats(emptyInventory()).ready).toBe(false);
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
  it('keeps unnamed group numbers stable within each room and prefers an entered name', () => {
    const d = emptyInventory();
    const room = newRoom('p', 'Kitchen', []);
    const other = newRoom('p', 'Office', [room]);
    d.rooms = [room, other];
    room.unsortedPhotos = ['a', 'b', 'c'];
    other.unsortedPhotos = ['d'];
    groupPhotos(d, room.id, ['a']);
    groupPhotos(d, room.id, ['b']);
    expect(d.items.map(title)).toEqual(['Item 1', 'Item 2']);
    d.items.shift();
    groupPhotos(d, room.id, ['c']);
    groupPhotos(d, other.id, ['d']);
    expect(d.items.map(title)).toEqual(['Item 2', 'Item 3', 'Item 1']);
    d.items[0].name = '  Sofa  ';
    expect(title(d.items[0])).toBe('Sofa');
    expect(title(newItem(room.id, []))).toBe('Untitled item');
  });
  it('rejects grouping into an item in another room without losing photos', () => {
    const d = emptyInventory();
    const a = newRoom('p', 'Office', []),
      b = newRoom('p', 'Kitchen', [a]);
    d.rooms.push(a, b);
    a.unsortedPhotos = ['photo'];
    const item = newItem(b.id, ['existing']);
    d.items.push(item);
    expect(() => groupPhotos(d, a.id, ['photo'], item.id)).toThrow();
    expect(a.unsortedPhotos).toEqual(['photo']);
    expect(item.photos).toEqual(['existing']);
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
  it('keeps missing fields absent', () => {
    expect(parseReceipt('')).toEqual({ store: undefined });
    expect(parseReceipt('SHOP\nSUBTOTAL 5.00')).not.toHaveProperty('amount');
  });
  it.each([
    ['Date: 11 . 21 . 2026', '2026-11-21'],
    ['PURCHASE DATE: 11 / 2I / 2O26', '2026-11-21'],
    ['November 21, 2026', '2026-11-21'],
    ['21-Nov-26', '2026-11-21'],
    ['2026-11-21', '2026-11-21'],
    ['02/29/2024', '2024-02-29'],
  ])('reads %s', (text, expected) => expect(parseReceipt(text).date).toBe(expected));
  it.each(['02/29/2025', '11/31/2026', '13/21/2026', '00/12/2026', '02/31/2026'])(
    'leaves impossible date %s blank',
    (text) => expect(parseReceipt(text).date).toBeUndefined(),
  );
  it('removes edge noise without damaging ordinary merchant names', () => {
    expect(parseReceipt('& i | - NAME nr em— a\n11/21/2026').store).toBe('NAME');
    expect(parseReceipt('*** OAK HOME STORE ***\n11/21/2026').store).toBe('OAK HOME STORE');
    expect(parseReceipt('Bed Bath & Beyond\n11/21/2026').store).toBe('Bed Bath & Beyond');
    expect(parseReceipt("Macy's\n11/21/2026").store).toBe("Macy's");
    expect(parseReceipt('TOTAL $50.00').store).toBeUndefined();
  });
  it('finds a labelled serial without guessing between unrelated numbers', () => {
    expect(parseSerialNumber('MODEL X1000\nS/N: AB-2026-001')).toBe('AB-2026-001');
    expect(parseSerialNumber('Serial Number: XY900012')).toBe('XY900012');
    expect(parseSerialNumber('MODEL X1000\nSKU 938472')).toBeUndefined();
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

describe('room and property deletion', () => {
  async function seed() {
    const property = (id: string): Property => ({
      id,
      name: id,
      coverPhoto: `${id}-cover`,
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
    const data = emptyInventory();
    data.properties = [property('delete'), property('keep')];
    const room = newRoom('delete', 'Kitchen', []),
      sibling = newRoom('delete', 'Office', []),
      other = newRoom('keep', 'Bedroom', []);
    room.roomPhotos = ['overview', 'shared'];
    room.unsortedPhotos = ['unsorted'];
    other.roomPhotos = ['shared'];
    data.rooms = [room, sibling, other];
    const item = newItem(room.id, ['item-photo']);
    item.receipts = [{ id: 'receipt', assetId: 'receipt-file', status: 'read', text: '' }];
    data.items = [item, newItem(sibling.id, ['sibling-photo']), newItem(other.id, ['keep-photo'])];
    const ids = [
      'delete-cover',
      'keep-cover',
      'overview',
      'shared',
      'unsorted',
      'item-photo',
      'receipt-file',
      'sibling-photo',
      'keep-photo',
    ];
    await mutate(
      (d) => Object.assign(d, data),
      ids.map((id) => ({
        id,
        original: new Blob([id]),
        thumbnail: null,
        width: 1,
        height: 1,
        name: id,
        type: 'image/png',
        capturedAt: '',
      })),
    );
    return { data, room, sibling, other, ids };
  }
  it('deletes a room with its records and assets, retaining sibling rooms and shared photos', async () => {
    const { data, room, sibling, other } = await seed();
    await deleteRoom(room.id);
    const saved = await loadInventory();
    expect(saved.properties).toEqual(data.properties);
    expect(saved.rooms.map((r) => r.id)).toEqual([sibling.id, other.id]);
    expect(saved.items.map((i) => i.roomId)).toEqual([sibling.id, other.id]);
    for (const id of ['overview', 'unsorted', 'item-photo', 'receipt-file'])
      expect(await getAsset(id)).toBeUndefined();
    for (const id of ['shared', 'sibling-photo', 'keep-photo', 'delete-cover'])
      expect(await getAsset(id)).toBeDefined();
  });
  it('deletes an entire property while preserving other properties and shared assets', async () => {
    const { data, other } = await seed();
    await deleteProperty('delete');
    const saved = await loadInventory();
    expect(saved.properties).toEqual([data.properties[1]]);
    expect(saved.rooms).toEqual([other]);
    expect(saved.items).toEqual([data.items[2]]);
    for (const id of [
      'delete-cover',
      'overview',
      'unsorted',
      'item-photo',
      'receipt-file',
      'sibling-photo',
    ])
      expect(await getAsset(id)).toBeUndefined();
    for (const id of ['shared', 'keep-cover', 'keep-photo'])
      expect(await getAsset(id)).toBeDefined();
  });
  it('restores deleted files and all records if saving the deletion fails', async () => {
    const { data, ids } = await seed();
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'state') throw Error('Synthetic save failure');
      return put.call(this, value, key!);
    });
    try {
      await expect(deleteProperty('delete')).rejects.toThrow('Synthetic save failure');
    } finally {
      spy.mockRestore();
    }
    expect(await loadInventory()).toEqual(data);
    for (const id of ids) expect(await (await getAsset(id))!.original.text()).toBe(id);
  });
});
