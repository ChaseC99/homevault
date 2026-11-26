import { useRef, useState } from 'react';
import { type Inventory, type Item, type Room, groupPhotos, title } from '../lib/model';
import { mutate } from '../lib/db';
import { Back, Button, Photo, Check, Empty, go } from './shared';
import { Details } from './Details';
import type { Run } from './Setup';

type Grouping = {
  itemId: string;
  photos: string[];
  created: boolean;
  previousReviewed: boolean;
  after: Item;
  order: string[];
};
const photoCount = (count: number) => `${count} ${count === 1 ? 'photo' : 'photos'}`;
// Undo may return photos, but must never delete work entered in the editor.
const hasDetails = (item: Item) =>
  item.reviewed ||
  item.receipts.length > 0 ||
  item.quantity !== 1 ||
  item.unitPriceCents !== null ||
  [
    item.name,
    item.category,
    item.brand,
    item.model,
    item.serialNumber,
    item.purchaseDate,
    item.store,
    item.condition,
    item.notes,
  ].some(Boolean);

export function Sort({
  data,
  room,
  run,
  editingItemId,
}: {
  data: Inventory;
  room: Room;
  run: Run;
  editingItemId?: string;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [last, setLast] = useState<Grouping>();
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const locked = useRef(false);
  const items = data.items.filter((item) => item.roomId === room.id);
  const selectedPhotos = room.unsortedPhotos.filter((photo) => selected.includes(photo));
  const edit = (itemId: string) => go(`/sort/${room.id}?item=${itemId}`);

  async function labelPhotos(photos: string[], destination?: string) {
    if (locked.current || !photos.length) return;
    locked.current = true;
    setBusy(true);
    let grouping: Grouping | undefined;
    const ok = await run(async () => {
      const committed = await mutate((d) => {
        const target = d.rooms.find((r) => r.id === room.id);
        if (!target) throw Error('Room no longer exists.');
        if (photos.some((photo) => !target.unsortedPhotos.includes(photo)))
          throw Error('Some photos already belong to an item. Select the remaining photos.');
        const order = [...target.unsortedPhotos];
        const previousReviewed = d.items.find((item) => item.id === destination)?.reviewed ?? false;
        const itemId = groupPhotos(d, room.id, photos, destination);
        grouping = {
          itemId,
          photos,
          created: !destination,
          previousReviewed,
          order,
          after: structuredClone(d.items.find((item) => item.id === itemId)!),
        };
      });
      const item = committed.items.find((item) => item.id === grouping!.itemId)!;
      setAnnouncement(destination ? `${title(item)} · ${photoCount(item.photos.length)}` : '');
    });
    if (ok && grouping) {
      setLast(grouping);
      setSelected([]);
      setExisting('');
      setSelecting(false);
      if (!destination) edit(grouping.itemId);
    }
    locked.current = false;
    setBusy(false);
  }
  async function undo() {
    if (!last || locked.current) return;
    locked.current = true;
    setBusy(true);
    let keptDetails = false;
    const ok = await run(() =>
      mutate((d) => {
        const item = d.items.find((item) => item.id === last.itemId);
        const target = d.rooms.find((r) => r.id === room.id);
        if (!item || !target) throw Error('This photo change is no longer available to undo.');
        const unchanged = JSON.stringify(item) === JSON.stringify(last.after);
        const moved = item.photos.filter((photo) => last.photos.includes(photo));
        item.photos = item.photos.filter((photo) => !moved.includes(photo));
        const unsorted = new Set([...target.unsortedPhotos, ...moved]);
        target.unsortedPhotos = [
          ...last.order.filter((photo) => unsorted.has(photo)),
          ...target.unsortedPhotos.filter((photo) => !last.order.includes(photo)),
        ];
        keptDetails = last.created && !!hasDetails(item);
        if (last.created && !item.photos.length && !hasDetails(item))
          d.items = d.items.filter((other) => other.id !== item.id);
        else if (!last.created && unchanged) item.reviewed = last.previousReviewed;
      }),
    );
    if (ok) {
      setLast(undefined);
      setAnnouncement(
        keptDetails ? 'Photos returned to the grid. Item details kept.' : 'Photo change undone',
      );
    }
    locked.current = false;
    setBusy(false);
  }
  async function moveToOverview() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const ok = await run(
      () =>
        mutate((d) => {
          const target = d.rooms.find((r) => r.id === room.id);
          if (!target) throw Error('Room no longer exists.');
          target.roomPhotos.push(
            ...target.unsortedPhotos.filter((photo) => selectedPhotos.includes(photo)),
          );
          target.unsortedPhotos = target.unsortedPhotos.filter(
            (photo) => !selectedPhotos.includes(photo),
          );
        }),
      'Moved to room overviews',
    );
    if (ok) {
      setSelected([]);
      setSelecting(false);
    }
    locked.current = false;
    setBusy(false);
  }

  const editing = items.find((item) => item.id === editingItemId);
  if (editing) return <Details key={editing.id} data={data} item={editing} run={run} labeling />;

  return (
    <>
      <Back to={`/room/${room.id}`} disabled={busy}>
        {room.name}
      </Back>
      <header>
        <h1>Label photos</h1>
        <p>Tap a photo to name the item and add any details you know.</p>
        <strong>{room.unsortedPhotos.length} left to label</strong>
      </header>
      {announcement && (
        <p className="save-state" role="status">
          {announcement}
        </p>
      )}
      {!!room.unsortedPhotos.length && (
        <div className="section-head">
          <h2>{selecting ? 'Select photos' : 'Photos to label'}</h2>
          <Button
            kind="text"
            disabled={busy}
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
              setExisting('');
            }}
          >
            {selecting ? 'Cancel selection' : 'Select photos'}
          </Button>
        </div>
      )}
      {selecting && (
        <p className="subtle">
          Select photos of the same item to group them, add them to an existing item, or move room
          overviews.
        </p>
      )}
      {room.unsortedPhotos.length ? (
        <div className="sort-grid">
          {room.unsortedPhotos.map((photo, index) => (
            <button
              key={photo}
              className={`sort-photo ${selected.includes(photo) ? 'selected' : ''}`}
              aria-label={`${selecting ? 'Select' : 'Label'} photo ${index + 1}`}
              aria-pressed={selecting ? selected.includes(photo) : undefined}
              disabled={busy}
              onClick={() =>
                selecting
                  ? setSelected((s) =>
                      s.includes(photo) ? s.filter((id) => id !== photo) : [...s, photo],
                    )
                  : void labelPhotos([photo])
              }
            >
              <Photo id={photo} />
              <span className="selection-indicator">
                {selected.includes(photo) ? <Check size={18} /> : index + 1}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Check size={34} />}
          title="Every photo has an item."
          action={<Button onClick={() => go(`/room/${room.id}`)}>Back to room</Button>}
        >
          Tap an item below to add or update its details. Unknown details can stay blank.
        </Empty>
      )}
      {!!items.length && (
        <section className="grouped-section" aria-labelledby="items-heading">
          <div className="section-head">
            <h2 id="items-heading">Items · {items.length}</h2>
            {last && (
              <Button kind="text" disabled={busy} onClick={undo}>
                Undo photo change
              </Button>
            )}
          </div>
          <ul className="group-list" aria-label="Labeled items">
            {items.map((item) => (
              <li key={item.id} className="group-card">
                <button className="group-open" disabled={busy} onClick={() => edit(item.id)}>
                  <Photo id={item.photos[0]} />
                  <span>
                    <strong>{title(item)}</strong>
                    <small>
                      {photoCount(item.photos.length)} · {item.reviewed ? 'Reviewed' : 'Draft'}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {selecting && !!room.unsortedPhotos.length && (
        <div className="sticky-action stack sort-actions">
          <div className="row">
            <span>{selectedPhotos.length} selected</span>
            {!!items.length && (
              <select
                aria-label="Add photos to"
                value={existing}
                disabled={busy}
                onChange={(event) => setExisting(event.target.value)}
              >
                <option value="">New item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {title(item)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            disabled={!selectedPhotos.length || busy}
            onClick={() => void labelPhotos(selectedPhotos, existing || undefined)}
          >
            {existing
              ? 'Add to item'
              : `Label ${selectedPhotos.length > 1 ? `${selectedPhotos.length} photos as one item` : 'selected photo'}`}
          </Button>
          {!!selectedPhotos.length && (
            <Button kind="text" disabled={busy} onClick={moveToOverview}>
              These are room overview photos
            </Button>
          )}
        </div>
      )}
    </>
  );
}
