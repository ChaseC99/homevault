import { useEffect, useRef, useState } from 'react';
import { type Inventory, type Item, type Room, groupPhotos, title } from '../lib/model';
import { errorMessage, mutate } from '../lib/db';
import { Back, Button, Field, Photo, Check, Empty, X, go } from './shared';
import type { Run } from './Setup';

type Naming = { photos: string[]; itemId?: string };
type Grouping = {
  itemId: string;
  photos: string[];
  created: boolean;
  previousReviewed: boolean;
  order: string[];
};
const photoCount = (count: number) => `${count} ${count === 1 ? 'photo' : 'photos'}`;

export function Sort({ data, room, run }: { data: Inventory; room: Room; run: Run }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [last, setLast] = useState<Grouping>();
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<Naming>();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const groups = useRef<HTMLUListElement>(null);
  const items = data.items.filter((item) => item.roomId === room.id);
  const selectedPhotos = room.unsortedPhotos.filter((photo) => selected.includes(photo));
  const label = (item: Item) =>
    item.name.trim() || `Item ${item.number ?? items.indexOf(item) + 1}`;

  useEffect(() => {
    if (naming) {
      dialog.current?.showModal();
      nameInput.current?.focus();
    } else dialog.current?.close();
  }, [naming]);
  useEffect(() => {
    if (last?.created && groups.current) groups.current.scrollLeft = groups.current.scrollWidth;
  }, [last?.itemId, items.length]);

  function closeNaming() {
    if (locked.current) return;
    setNaming(undefined);
    setNameError('');
  }
  function startNaming(item?: Item) {
    if (locked.current || (!item && !selectedPhotos.length)) return;
    setName(item?.name ?? '');
    setNameError('');
    setNaming({ photos: item ? item.photos : selectedPhotos, itemId: item?.id });
  }
  async function createGroup(photos: string[], itemName: string, destination?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNameError('');
    let grouping: Grouping | undefined;
    try {
      const committed = await mutate((d) => {
        const target = d.rooms.find((r) => r.id === room.id);
        if (!target) throw Error('Room no longer exists.');
        if (photos.some((photo) => !target.unsortedPhotos.includes(photo)))
          throw Error(
            'Some photos have already been grouped. Go back and select the remaining photos.',
          );
        const order = [...target.unsortedPhotos];
        const previousReviewed = d.items.find((item) => item.id === destination)?.reviewed ?? false;
        const itemId = groupPhotos(d, room.id, photos, destination);
        if (!destination) d.items.find((item) => item.id === itemId)!.name = itemName.trim();
        grouping = { itemId, photos, created: !destination, previousReviewed, order };
      });
      const item = committed.items.find((item) => item.id === grouping!.itemId)!;
      setAnnouncement(
        `${title(item)} ${destination ? 'updated' : 'created'} · ${photoCount(item.photos.length)}`,
      );
      setLast(grouping);
      setSelected([]);
      setExisting('');
      setNaming(undefined);
    } catch (error) {
      if (naming) setNameError(errorMessage(error));
      else
        await run(async () => {
          throw error;
        });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function saveName() {
    if (!naming || !name.trim() || locked.current) return;
    if (!naming.itemId) return createGroup(naming.photos, name);
    locked.current = true;
    setBusy(true);
    setNameError('');
    try {
      await mutate((d) => {
        const item = d.items.find((item) => item.id === naming.itemId && item.roomId === room.id);
        if (!item) throw Error('Item no longer exists.');
        item.name = name.trim();
        item.reviewed = false;
      });
      setAnnouncement(`Named ${name.trim()}`);
      setNaming(undefined);
    } catch (error) {
      setNameError(errorMessage(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function undo() {
    if (!last || locked.current) return;
    locked.current = true;
    setBusy(true);
    const ok = await run(
      () =>
        mutate((d) => {
          const item = d.items.find((item) => item.id === last.itemId);
          const target = d.rooms.find((r) => r.id === room.id);
          if (!item || !target) throw Error('This grouping is no longer available to undo.');
          const moved = item.photos.filter((photo) => last.photos.includes(photo));
          item.photos = item.photos.filter((photo) => !moved.includes(photo));
          const unsorted = new Set([...target.unsortedPhotos, ...moved]);
          target.unsortedPhotos = [
            ...last.order.filter((photo) => unsorted.has(photo)),
            ...target.unsortedPhotos.filter((photo) => !last.order.includes(photo)),
          ];
          if (last.created && !item.photos.length && !item.receipts.length)
            d.items = d.items.filter((other) => other.id !== item.id);
          else if (!last.created) item.reviewed = last.previousReviewed;
        }),
      'Grouping undone',
    );
    if (ok) {
      setLast(undefined);
      setAnnouncement('Grouping undone');
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
          const target = d.rooms.find((r) => r.id === room.id)!;
          target.roomPhotos.push(
            ...target.unsortedPhotos.filter((photo) => selectedPhotos.includes(photo)),
          );
          target.unsortedPhotos = target.unsortedPhotos.filter(
            (photo) => !selectedPhotos.includes(photo),
          );
        }),
      'Moved to room overviews',
    );
    if (ok) setSelected([]);
    locked.current = false;
    setBusy(false);
  }
  return (
    <>
      <Back to={`/room/${room.id}`} disabled={busy}>
        {room.name}
      </Back>
      <header>
        <h1>Sort photos</h1>
        <p>Select photos of the same item, then give it a name.</p>
        <strong>{room.unsortedPhotos.length} left to sort</strong>
      </header>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {!!items.length && (
        <section className="grouped-section" aria-labelledby="grouped-heading">
          <div className="section-head">
            <h2 id="grouped-heading">Grouped items · {items.length}</h2>
            {last && (
              <Button kind="text" disabled={busy} onClick={undo}>
                Undo
              </Button>
            )}
          </div>
          <ul ref={groups} className="group-list" aria-label="Grouped items">
            {items.map((item) => (
              <li key={item.id} className="group-card">
                <button
                  className="group-open"
                  disabled={busy}
                  onClick={() => go(`/item/${item.id}`)}
                >
                  <Photo id={item.photos[0]} />
                  <span>
                    <strong>{label(item)}</strong>
                    <small>{photoCount(item.photos.length)}</small>
                  </span>
                </button>
                {!item.name.trim() && (
                  <button
                    className="group-add-name"
                    disabled={busy}
                    aria-label={`Add name for ${label(item)}`}
                    onClick={() => startNaming(item)}
                  >
                    Add name
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {room.unsortedPhotos.length ? (
        <div className="sort-grid">
          {room.unsortedPhotos.map((photo, index) => (
            <button
              key={photo}
              className={`sort-photo ${selected.includes(photo) ? 'selected' : ''}`}
              aria-label={`Photo ${index + 1}`}
              aria-pressed={selected.includes(photo)}
              disabled={busy}
              onClick={() =>
                setSelected((s) =>
                  s.includes(photo) ? s.filter((id) => id !== photo) : [...s, photo],
                )
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
          title="Everything has a place."
          action={<Button onClick={() => go(`/room/${room.id}`)}>Back to room</Button>}
        >
          Your photos are grouped. You can add names and details whenever you’re ready.
        </Empty>
      )}
      {!!room.unsortedPhotos.length && (
        <div className="sticky-action stack sort-actions">
          <div className="row">
            <span>{selectedPhotos.length} selected</span>
            {!!items.length && (
              <select
                aria-label="Group destination"
                value={existing}
                disabled={busy}
                onChange={(event) => setExisting(event.target.value)}
              >
                <option value="">New item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            disabled={!selectedPhotos.length || busy}
            onClick={() =>
              existing ? void createGroup(selectedPhotos, '', existing) : startNaming()
            }
          >
            {existing
              ? 'Add to item'
              : selectedPhotos.length
                ? `Group ${photoCount(selectedPhotos.length)}`
                : 'Select photos to group'}
          </Button>
          {!!selectedPhotos.length && (
            <Button kind="text" disabled={busy} onClick={moveToOverview}>
              These are room overview photos
            </Button>
          )}
        </div>
      )}
      <dialog
        ref={dialog}
        className="naming-sheet"
        aria-labelledby="group-name-title"
        onCancel={(event) => {
          if (locked.current) event.preventDefault();
          else closeNaming();
        }}
      >
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <div className="row">
            <h2 id="group-name-title">What’s this item?</h2>
            <button
              type="button"
              className="naming-close"
              aria-label="Back to sorting"
              disabled={busy}
              onClick={closeNaming}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="photo-strip naming-photos">
            {naming?.photos.map((photo, index) => (
              <Photo key={photo} id={photo} alt={`Selected photo ${index + 1}`} />
            ))}
          </div>
          <Field label="Item name">
            <input
              ref={nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sofa"
              maxLength={180}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          {nameError && (
            <p className="naming-error" role="alert">
              {nameError}
            </p>
          )}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : naming?.itemId ? 'Save name' : 'Create item'}
          </Button>
          <Button
            kind="text"
            disabled={busy}
            onClick={() =>
              naming?.itemId ? closeNaming() : naming && void createGroup(naming.photos, '')
            }
          >
            Name later
          </Button>
        </form>
      </dialog>
    </>
  );
}
