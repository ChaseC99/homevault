import { useState } from 'react';
import { type Inventory, type Room, groupPhotos, title } from '../lib/model';
import { mutate } from '../lib/db';
import { Back, Button, Photo, Check, Empty, go } from './shared';
import type { Run } from './Setup';
export function Sort({ data, room, run }: { data: Inventory; room: Room; run: Run }) {
  const [selected, setSelected] = useState<string[]>([]),
    [last, setLast] = useState<{ itemId: string; photos: string[]; created: boolean }>(),
    [existing, setExisting] = useState(''),
    [busy, setBusy] = useState(false);
  const items = data.items.filter((i) => i.roomId === room.id);
  async function group() {
    setBusy(true);
    let itemId = '';
    const ok = await run(
      () =>
        mutate((d) => {
          itemId = groupPhotos(d, room.id, selected, existing || undefined);
        }),
      existing ? 'Photos added to item' : 'Item created',
    );
    if (ok) {
      setLast({ itemId, photos: selected, created: !existing });
      setSelected([]);
    }
    setBusy(false);
  }
  return (
    <>
      <Back to={`/room/${room.id}`}>{room.name}</Back>
      <header>
        <span className="eyebrow">MAKE SENSE OF THE WALKTHROUGH</span>
        <h1>Sort photos</h1>
        <p>Tap the photos that show the same thing, then make an item.</p>
        <strong>{room.unsortedPhotos.length} left to sort</strong>
      </header>
      {last && (
        <div className="notice">
          <span>Photos grouped. Details can wait.</span>
          <Button
            kind="text"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await mutate((d) => {
                  const i = d.items.find((x) => x.id === last.itemId),
                    r = d.rooms.find((x) => x.id === room.id)!;
                  if (!i) return;
                  const moved = i.photos.filter((p) => last.photos.includes(p));
                  i.photos = i.photos.filter((p) => !moved.includes(p));
                  r.unsortedPhotos = [...moved, ...r.unsortedPhotos];
                  if (last.created && !i.photos.length && !i.receipts.length)
                    d.items = d.items.filter((x) => x.id !== i.id);
                });
                setLast(undefined);
              }, 'Grouping undone')
            }
          >
            Undo
          </Button>
        </div>
      )}
      <div className="chips">
        {items.map((i, n) => (
          <button key={i.id} className="chip" onClick={() => go(`/item/${i.id}`)}>
            {i.name || `Item ${n + 1}`} · {i.photos.length} photos
          </button>
        ))}
      </div>
      {room.unsortedPhotos.length ? (
        <div className="sort-grid">
          {room.unsortedPhotos.map((p, n) => (
            <button
              key={p}
              className={`sort-photo ${selected.includes(p) ? 'selected' : ''}`}
              aria-label={`Photo ${n + 1}`}
              aria-pressed={selected.includes(p)}
              onClick={() =>
                setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
              }
            >
              <Photo id={p} />
              <span className="selection-indicator">
                {selected.includes(p) ? <Check size={18} /> : n + 1}
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
          Your photos are grouped. You can add details whenever you’re ready.
        </Empty>
      )}
      <div className="sticky-action stack">
        <div className="row">
          <span>{selected.length} selected</span>
          {items.length > 0 && (
            <select
              aria-label="Group destination"
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
            >
              <option value="">New item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {title(i)}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button disabled={!selected.length || busy} onClick={group}>
          {existing ? 'Add to item' : 'Make item'}
        </Button>
        {selected.length > 0 && (
          <Button
            kind="text"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await mutate((d) => {
                  const r = d.rooms.find((r) => r.id === room.id)!;
                  r.roomPhotos.push(...r.unsortedPhotos.filter((p) => selected.includes(p)));
                  r.unsortedPhotos = r.unsortedPhotos.filter((p) => !selected.includes(p));
                });
                setSelected([]);
              }, 'Moved to room overviews')
            }
          >
            These are room overview photos
          </Button>
        )}
      </div>
    </>
  );
}
