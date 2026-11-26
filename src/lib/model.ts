export interface Property {
  id: string;
  name: string;
  coverPhoto?: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  location?: { latitude: number; longitude: number; accuracy: number };
  insurer: string;
  policyNumber: string;
  agentName: string;
  agentPhone: string;
  walkthroughStartDate: string;
  walkthroughEndDate: string;
  createdAt: string;
  updatedAt: string;
}
export interface Room {
  id: string;
  propertyId: string;
  name: string;
  type: string;
  order: number;
  roomPhotos: string[];
  unsortedPhotos: string[];
}
export interface Receipt {
  id: string;
  assetId: string;
  status: 'pending' | 'read' | 'partial' | 'failed';
  text: string;
  store?: string;
  date?: string;
  amount?: number;
  error?: string;
}
export interface Item {
  id: string;
  roomId: string;
  photos: string[];
  name: string;
  category: string;
  number?: number;
  brand: string;
  model: string;
  serialNumber: string;
  quantity: number;
  unitPriceCents: number | null;
  purchaseDate: string;
  store: string;
  condition: string;
  notes: string;
  reviewed: boolean;
  receipts: Receipt[];
  createdAt: string;
}
export interface Inventory {
  version: 1;
  properties: Property[];
  rooms: Room[];
  items: Item[];
  organizer: { name: string; business: string; email: string; phone: string };
}
export interface Asset {
  id: string;
  original: Blob;
  thumbnail: Blob | null;
  width: number;
  height: number;
  name: string;
  type: string;
  capturedAt: string;
}
export const emptyInventory = (): Inventory => ({
  version: 1,
  properties: [],
  rooms: [],
  items: [],
  organizer: { name: '', business: '', email: '', phone: '' },
});
export const id = () => crypto.randomUUID();
export const roomTypes = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Bathroom',
  'Dining Room',
  'Office',
  'Family Room',
  'Laundry',
  'Garage',
  'Basement',
  'Closet',
  'Patio / Yard',
];
export function newRoom(propertyId: string, type: string, rooms: Room[], name?: string): Room {
  const same = rooms.filter((r) => r.propertyId === propertyId && r.type === type);
  let n = same.length + 1;
  let candidate = name?.trim() || (n === 1 ? type : `${type} ${n}`);
  while (!name && rooms.some((r) => r.propertyId === propertyId && r.name === candidate))
    candidate = `${type} ${++n}`;
  return {
    id: id(),
    propertyId,
    type,
    name: candidate,
    order: rooms.filter((r) => r.propertyId === propertyId).length,
    roomPhotos: [],
    unsortedPhotos: [],
  };
}
export const newItem = (roomId: string, photos: string[]): Item => ({
  id: id(),
  roomId,
  photos,
  name: '',
  category: '',
  brand: '',
  model: '',
  serialNumber: '',
  quantity: 1,
  unitPriceCents: null,
  purchaseDate: '',
  store: '',
  condition: '',
  notes: '',
  reviewed: false,
  receipts: [],
  createdAt: new Date().toISOString(),
});
export const itemTotal = (i: Item) => (i.unitPriceCents ?? 0) * i.quantity;
export const money = (c: number | null) =>
  c === null
    ? 'Not recorded'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
export const title = (i: Item) =>
  i.name.trim() || (i.number ? `Item ${i.number}` : 'Untitled item');
export function stats(data: Inventory, propertyId?: string, roomId?: string) {
  const rooms = data.rooms.filter(
    (r) => (!propertyId || r.propertyId === propertyId) && (!roomId || r.id === roomId),
  );
  const items = data.items.filter((i) => rooms.some((r) => r.id === i.roomId));
  const unsorted = rooms.reduce((n, r) => n + r.unsortedPhotos.length, 0),
    needs = items.filter((i) => !i.reviewed).length;
  return {
    rooms,
    items,
    total: items.reduce((n, i) => n + itemTotal(i), 0),
    needs,
    unsorted,
    unknown: items.filter((i) => i.unitPriceCents === null).length,
    ready: items.length > 0 && needs === 0 && unsorted === 0,
  };
}
export function groupPhotos(
  data: Inventory,
  roomId: string,
  photoIds: string[],
  existingId?: string,
) {
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room) throw Error('Room no longer exists.');
  const photos = room.unsortedPhotos.filter((p) => photoIds.includes(p));
  if (!photos.length) throw Error('Select unsorted photos first.');
  const item = existingId
    ? data.items.find((i) => i.id === existingId && i.roomId === roomId)
    : newItem(roomId, []);
  if (!item) throw Error('Item no longer exists.');
  item.photos.push(...photos);
  item.reviewed = false;
  if (!existingId) {
    const roomItems = data.items.filter((i) => i.roomId === roomId);
    item.number = roomItems.reduce((max, i, index) => Math.max(max, i.number ?? index + 1), 0) + 1;
    data.items.push(item);
  }
  room.unsortedPhotos = room.unsortedPhotos.filter((p) => !photos.includes(p));
  return item.id;
}
export function parsePrice(value: string): number | null {
  if (value.trim() === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100)))
    throw Error('Enter a non-negative price with up to two decimal places.');
  return Math.round(Number(value) * 100);
}
export function validateItem(i: Item) {
  if (!Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 99999)
    throw Error('Quantity must be a whole number from 1 to 99,999.');
  if (
    i.unitPriceCents !== null &&
    (!Number.isSafeInteger(i.unitPriceCents) ||
      i.unitPriceCents < 0 ||
      !Number.isSafeInteger(itemTotal(i)))
  )
    throw Error('Enter a valid purchase price.');
}
