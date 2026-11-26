import { useEffect, useRef, useState } from 'react';
import {
  type Inventory,
  type Item,
  id,
  groupPhotos,
  money,
  parsePrice,
  title,
  validateItem,
} from '../lib/model';
import { mutate, errorMessage } from '../lib/db';
import { guardNavigation } from '../lib/navigation';
import { prepareAsset } from '../lib/media';
import { readReceipt, readSerialNumber } from '../lib/ocr';
import { Back, Button, Field, FilePicker, Photo, PhotoViewer, Badge, go } from './shared';
import { ScanLine, X } from 'lucide-react';
import { ReceiptPreview } from './ReceiptPreview';
import type { Run } from './Setup';
type Form = Omit<Item, 'unitPriceCents'> & { price: string };
const toForm = (item: Item): Form => ({
  ...item,
  price: item.unitPriceCents === null ? '' : (item.unitPriceCents / 100).toFixed(2),
});
export function Details({
  data,
  item,
  run,
  session = false,
  labeling = false,
}: {
  data: Inventory;
  item: Item;
  run: Run;
  session?: boolean;
  labeling?: boolean;
}) {
  const [form, setForm] = useState<Form>(() => toForm(item)),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [saveStatus, setSaveStatus] = useState(''),
    [viewer, setViewer] = useState('');
  const [removed, setRemoved] = useState<{ id: string; index: number }>();
  const [serialResult, setSerialResult] = useState<{ text: string; serial?: string }>();
  const [serialProgress, setSerialProgress] = useState('');
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [additionalPhotos, setAdditionalPhotos] = useState<string[]>([]);
  const locked = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const categories = Array.from(
    new Map(
      [
        'Furniture',
        'Electronics',
        'Art',
        'Decor',
        'Appliances',
        'Jewelry',
        ...data.items.map((i) => i.category.trim()).filter(Boolean),
      ].map((category) => [category.toLowerCase(), category]),
    ).values(),
  );
  const current = useRef(form),
    dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  current.current = form;
  const room = data.rooms.find((r) => r.id === item.roomId)!;
  const queue = useRef(
    data.items.filter((i) => i.roomId === item.roomId && !i.reviewed).map((i) => i.id),
  );
  const pending = queue.current
    .slice(queue.current.indexOf(item.id) + 1)
    .filter((key) => data.items.some((i) => i.id === key && !i.reviewed));
  const returnTo = labeling ? `/sort/${room.id}` : `/room/${room.id}`;
  function update(key: keyof Form, value: string | number | boolean) {
    dirty.current = true;
    const next = { ...current.current, reviewed: false, [key]: value };
    current.current = next;
    setForm(next);
    setSaveStatus('Unsaved changes');
  }
  async function persist(reviewed?: boolean) {
    const { price, ...values } = current.current;
    const snapshot = current.current;
    const next = {
      ...values,
      name: values.name.trim(),
      unitPriceCents: parsePrice(price),
      reviewed: reviewed ?? values.reviewed,
    };
    validateItem(next);
    // Serialize autosaves and explicit saves so an older draft cannot overwrite Save.
    const write = writes.current
      .catch(() => {})
      .then(async () => {
        await mutate((d) => {
          const i = d.items.find((i) => i.id === item.id);
          if (!i) throw Error('Item no longer exists.');
          Object.assign(i, { ...next, photos: i.photos, receipts: i.receipts });
        });
      });
    writes.current = write;
    await write;
    if (current.current === snapshot) {
      dirty.current = false;
      setSaveStatus(next.reviewed ? 'Reviewed and saved' : 'Draft saved on this device');
    }
  }
  useEffect(() => {
    if (!dirty.current) return;
    timer.current = setTimeout(() => {
      if (locked.current) return;
      persist().catch((e) => setSaveStatus(`Not saved: ${errorMessage(e)}`));
    }, 600);
    return () => clearTimeout(timer.current);
  }, [form, busy]);
  useEffect(() => {
    const warning = (e: BeforeUnloadEvent) => {
      if (dirty.current || locked.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warning);
    return () => {
      window.removeEventListener('beforeunload', warning);
      clearTimeout(timer.current);
    };
  }, []);
  // Hash navigation (including browser Back) must not discard invalid or failed drafts.
  useEffect(
    () =>
      guardNavigation(async () => {
        if (locked.current) return false;
        return dirty.current ? saveChanges() : true;
      }),
    [],
  );
  async function saveChanges(reviewed?: boolean) {
    if (locked.current) return false;
    locked.current = true;
    clearTimeout(timer.current);
    setBusy(true);
    const ok = await run(() => persist(reviewed), 'Item saved');
    locked.current = false;
    setBusy(false);
    return ok;
  }
  async function finish(reviewed?: boolean, next = false) {
    const ok = await saveChanges(reviewed);
    if (ok) {
      if (next && pending.length) go(`/details/${pending[0]}?session`);
      else go(next ? `/room/${room.id}` : returnTo);
    }
  }
  async function work(action: () => Promise<unknown>, message?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const ok = await run(action, message);
    locked.current = false;
    setBusy(false);
    return ok;
  }
  async function attach(files: File[]) {
    await work(async () => {
      for (const file of files) {
        const asset = await prepareAsset(file, file.name);
        const rid = id();
        await mutate(
          (d) => {
            d.items
              .find((i) => i.id === item.id)!
              .receipts.push({ id: rid, assetId: asset.id, status: 'pending', text: '' });
          },
          [asset],
        );
        await scan(rid);
      }
    });
  }
  async function scan(rid: string) {
    setProgress('Reading receipt on this device…');
    await run(async () => {
      const fields = await readReceipt(item.id, rid, setProgress);
      if (fields) {
        if (!current.current.store && fields.store) update('store', fields.store);
        if (!current.current.purchaseDate && fields.date) update('purchaseDate', fields.date);
      }
    });
    setProgress('');
  }
  const fields = (keys: [keyof Form, string, string?][]) =>
    keys.map(([key, label, type]) => (
      <Field key={key} label={label}>
        <input
          value={String(form[key] ?? '')}
          type={type ?? 'text'}
          maxLength={180}
          onChange={(e) => update(key, e.target.value)}
        />
      </Field>
    ));
  return (
    <>
      <Back to={returnTo} disabled={busy} onClick={() => void finish()}>
        {labeling ? 'Photo grid' : room.name}
      </Back>
      <div className="row">
        <Badge warn={!form.reviewed}>{form.reviewed ? 'Reviewed' : 'Draft'}</Badge>
        <span className="subtle">{room.name}</span>
        {session && (
          <Button kind="text" disabled={busy} onClick={() => finish(false, true)}>
            Skip
          </Button>
        )}
      </div>
      <header>
        {!labeling && (
          <span className="eyebrow">
            {session ? `${pending.length + 1} ITEMS LEFT IN THIS SESSION` : 'ITEM DETAILS'}
          </span>
        )}
        <h1>{labeling ? 'Label this item' : title(item)}</h1>
        <p>Record what you know. Unknown details can stay blank.</p>
      </header>
      <fieldset className="editor-fields" disabled={busy}>
        <div className="photo-strip editable-photos">
          {item.photos.map((p, n) => (
            <div className="editable-photo" key={p}>
              <Photo id={p} alt={`Open item photo ${n + 1}`} onClick={() => setViewer(p)} />
              <button
                className="remove-photo"
                aria-label={`Remove item photo ${n + 1}`}
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    await mutate((d) => {
                      const target = d.items.find((i) => i.id === item.id)!;
                      target.photos = target.photos.filter((id) => id !== p);
                    });
                    setRemoved({ id: p, index: n });
                  }, 'Photo removed')
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        {removed && (
          <div className="notice" role="status">
            <span>Photo removed.</span>
            <Button
              kind="text"
              disabled={busy}
              onClick={() =>
                work(async () => {
                  await mutate((d) => {
                    const target = d.items.find((i) => i.id === item.id)!;
                    if (!target.photos.includes(removed.id))
                      target.photos.splice(removed.index, 0, removed.id);
                  });
                  setRemoved(undefined);
                }, 'Photo restored')
              }
            >
              Undo
            </Button>
          </div>
        )}
        <section className="card form-card">
          {fields([['name', 'Item name']])}
          <Field label="Category" hint="Choose a suggestion or type your own category.">
            <input
              aria-label="Category"
              list="item-categories"
              value={form.category}
              maxLength={180}
              onChange={(e) => update('category', e.target.value)}
              autoComplete="off"
            />
            <datalist id="item-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
        </section>
        <div className="button-row">
          <FilePicker
            label="Add item photos"
            multiple
            disabled={busy}
            onFiles={(files) =>
              work(async () => {
                for (const file of files) {
                  const asset = await prepareAsset(file, file.name);
                  await mutate(
                    (d) => d.items.find((i) => i.id === item.id)!.photos.push(asset.id),
                    [asset],
                  );
                }
              })
            }
          />
          {!!room.unsortedPhotos.length && (
            <Button kind="text" disabled={busy} onClick={() => setAddingPhotos(!addingPhotos)}>
              {addingPhotos ? 'Close room photos' : 'Choose additional room photos'}
            </Button>
          )}
        </div>
        {addingPhotos && !!room.unsortedPhotos.length && (
          <section className="card form-card" aria-label="Additional photos of this item">
            <h2>More photos of this item</h2>
            <p>Select any other photos of this same item.</p>
            <div className="sort-grid">
              {room.unsortedPhotos.map((photo, index) => (
                <button
                  key={photo}
                  className={`sort-photo ${additionalPhotos.includes(photo) ? 'selected' : ''}`}
                  aria-label={`Add room photo ${index + 1}`}
                  aria-pressed={additionalPhotos.includes(photo)}
                  onClick={() =>
                    setAdditionalPhotos((photos) =>
                      photos.includes(photo)
                        ? photos.filter((id) => id !== photo)
                        : [...photos, photo],
                    )
                  }
                >
                  <Photo id={photo} />
                </button>
              ))}
            </div>
            <Button
              disabled={busy || !additionalPhotos.length}
              onClick={() =>
                void work(async () => {
                  await mutate((d) => {
                    const target = d.rooms.find((r) => r.id === room.id)!;
                    if (additionalPhotos.some((photo) => !target.unsortedPhotos.includes(photo)))
                      throw Error(
                        'Some photos already belong to an item. Select the remaining photos.',
                      );
                    groupPhotos(d, room.id, additionalPhotos, item.id);
                  });
                  update('reviewed', false);
                  setAdditionalPhotos([]);
                  setAddingPhotos(false);
                }, 'Photos added')
              }
            >
              Add selected photos
            </Button>
          </section>
        )}
        {!!item.photos.length && (
          <details className="card form-card photo-options">
            <summary>Organize photos</summary>
            <p>
              Choose the first photo or return a photo to the labeling grid. Details and receipts
              stay with this item.
            </p>
            {item.photos.map((photo, index) => (
              <div className="row" key={photo}>
                <Photo id={photo} />
                <span>Photo {index + 1}</span>
                <Button
                  kind="text"
                  disabled={busy || index === 0}
                  onClick={() =>
                    void work(
                      () =>
                        mutate((d) => {
                          const target = d.items.find((i) => i.id === item.id)!;
                          target.photos = [photo, ...target.photos.filter((id) => id !== photo)];
                        }),
                      'First photo changed',
                    )
                  }
                >
                  Make first
                </Button>
                <Button
                  kind="text"
                  disabled={busy}
                  onClick={() =>
                    void work(
                      () =>
                        mutate((d) => {
                          const target = d.items.find((i) => i.id === item.id)!;
                          target.photos = target.photos.filter((id) => id !== photo);
                          const targetRoom = d.rooms.find((r) => r.id === room.id)!;
                          if (!targetRoom.unsortedPhotos.includes(photo))
                            targetRoom.unsortedPhotos.push(photo);
                        }),
                      'Photo returned to labeling grid',
                    )
                  }
                >
                  Return to grid
                </Button>
              </div>
            ))}
          </details>
        )}
        <div className="stack">
          <section className="card form-card">
            <div className="row">
              <h2>Receipts</h2>
              <Badge>{item.receipts.length} attached</Badge>
            </div>
            <p>
              Read price, date and store on this device. Check every suggestion; receipts can
              contain several purchases.
            </p>
            <div className="button-row">
              <FilePicker label="Scan receipt" capture disabled={busy} onFiles={attach} />
              <FilePicker
                label="Attach image or PDF"
                accept="image/*,application/pdf,.pdf"
                multiple
                disabled={busy}
                onFiles={attach}
              />
            </div>
            {progress && (
              <p className="notice" role="status">
                {progress}
              </p>
            )}
            {item.receipts.map((r, n) => (
              <div className="receipt" key={r.id}>
                <div className="row">
                  <strong>Receipt {n + 1}</strong>
                  <Badge warn={r.status !== 'read'}>
                    {r.status === 'pending'
                      ? 'Awaiting reading'
                      : r.status === 'read'
                        ? 'Read · check details'
                        : r.status === 'partial'
                          ? 'Partially read'
                          : 'Needs manual entry'}
                  </Badge>
                </div>
                {r.error && <p>{r.error}</p>}
                {(r.store || r.date) && (
                  <p className="subtle">Found: {[r.store, r.date].filter(Boolean).join(' · ')}</p>
                )}
                {r.amount !== undefined && (
                  <div className="receipt-amount">
                    <strong>Receipt total: {money(r.amount)}</strong>
                    <p>
                      {form.quantity > 1
                        ? `Is this amount for one unit, or all ${form.quantity} units of this item? `
                        : 'Use this amount if the receipt is for this item. '}
                      Ignore it if it includes other purchases.
                    </p>
                    <div className="button-row">
                      <Button
                        kind="secondary"
                        disabled={busy}
                        onClick={() => update('price', (r.amount! / 100).toFixed(2))}
                      >
                        Use as unit price
                      </Button>
                      {form.quantity > 1 && (
                        <Button
                          kind="secondary"
                          disabled={busy || !Number.isInteger(form.quantity)}
                          onClick={() =>
                            update(
                              'price',
                              (Math.round(r.amount! / form.quantity) / 100).toFixed(2),
                            )
                          }
                        >
                          Divide by {form.quantity}
                        </Button>
                      )}
                    </div>
                    {form.quantity > 1 && (
                      <small>Division rounds the unit price to the nearest cent.</small>
                    )}
                  </div>
                )}
                <ReceiptPreview assetId={r.assetId} label={`Receipt ${n + 1}`} />
                <div className="button-row">
                  <Button kind="text" disabled={busy} onClick={() => work(() => scan(r.id))}>
                    Read again
                  </Button>
                  <Button
                    kind="text danger"
                    disabled={busy}
                    onClick={() =>
                      work(
                        () =>
                          mutate((d) => {
                            const i = d.items.find((i) => i.id === item.id)!;
                            i.receipts = i.receipts.filter((x) => x.id !== r.id);
                          }),
                        'Receipt detached',
                      )
                    }
                  >
                    Detach
                  </Button>
                </div>
                {r.text && (
                  <details>
                    <summary>Recognized text</summary>
                    <pre>{r.text}</pre>
                  </details>
                )}
              </div>
            ))}
            {!item.receipts.length && (
              <small>No receipt is okay. Add the information the client has.</small>
            )}
          </section>
          <section className="card form-card">
            <h2>Purchase</h2>
            <div className="fields two">
              <Field label="Purchase price per unit (USD)">
                <input
                  inputMode="decimal"
                  value={form.price}
                  placeholder="Unknown"
                  onChange={(e) => update('price', e.target.value)}
                />
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min="1"
                  max="99999"
                  step="1"
                  value={form.quantity || ''}
                  onChange={(e) => update('quantity', Number(e.target.value))}
                />
              </Field>
              {fields([['purchaseDate', 'Date purchased', 'date']])}
            </div>
            {fields([['store', 'Where purchased']])}
            <div className="total-line">
              <span>Item total · unit price × quantity</span>
              <strong>
                {(() => {
                  try {
                    return money(form.price ? parsePrice(form.price)! * form.quantity : null);
                  } catch {
                    return 'Check price';
                  }
                })()}
              </strong>
            </div>
          </section>
          <section className="card form-card">
            <h2>Identification</h2>
            {fields([
              ['brand', 'Brand'],
              ['model', 'Model'],
            ])}
            <div className="field">
              <label htmlFor="serial-number">Serial number</label>
              <div className="input-with-action">
                <input
                  id="serial-number"
                  value={form.serialNumber}
                  maxLength={180}
                  onChange={(e) => update('serialNumber', e.target.value)}
                />
                <FilePicker
                  label="Scan serial number"
                  icon={<ScanLine size={20} />}
                  iconOnly
                  capture
                  disabled={busy}
                  onFiles={async (files) => {
                    if (!files[0]) return;
                    setSerialProgress('Reading serial number…');
                    setSerialResult(undefined);
                    await work(async () =>
                      setSerialResult(await readSerialNumber(files[0], setSerialProgress)),
                    );
                    setSerialProgress('');
                  }}
                />
              </div>
            </div>
            {serialProgress && <p role="status">{serialProgress}</p>}
            {serialResult && (
              <div className="stack notice serial-result">
                <p>
                  {serialResult.serial
                    ? `Found: ${serialResult.serial}. Check the label before applying.`
                    : 'No clear serial number found. Enter it manually or try a closer photo.'}
                </p>
                {serialResult.serial && (
                  <Button
                    kind="secondary"
                    onClick={() => {
                      update('serialNumber', serialResult.serial!);
                      setSerialResult(undefined);
                    }}
                  >
                    Use serial number
                  </Button>
                )}
                <details>
                  <summary>Recognized label text</summary>
                  <pre>{serialResult.text || 'No text recognized'}</pre>
                </details>
              </div>
            )}
          </section>
          <section className="card form-card">
            <h2>Condition & notes</h2>
            <Field label="Condition">
              <select value={form.condition} onChange={(e) => update('condition', e.target.value)}>
                <option value="">Not recorded</option>
                {['New', 'Good', 'Fair', 'Worn'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes / additional information">
              <textarea
                rows={4}
                maxLength={6000}
                value={form.notes}
                placeholder="Materials, identifying marks, provenance…"
                onChange={(e) => update('notes', e.target.value)}
              />
            </Field>
          </section>
          <div className="notice">
            <label className="review-check">
              <input
                type="checkbox"
                checked={form.reviewed}
                onChange={(event) => update('reviewed', event.target.checked)}
              />
              <span>
                <strong>Reviewed</strong> — I’ve checked the available information. Unknown details
                can stay blank.
              </span>
            </label>
          </div>
          <p className="save-state" role="status">
            {saveStatus || 'Changes are saved as a draft as you type.'}
          </p>
        </div>
      </fieldset>
      <div className="sticky-action stack editor-save">
        <Button disabled={busy} onClick={() => finish(session ? true : undefined, session)}>
          {busy
            ? 'Saving…'
            : labeling
              ? 'Save & return to photos'
              : session
                ? 'Mark reviewed & next item'
                : 'Save & return to room'}
        </Button>
        {session && (
          <Button kind="secondary" disabled={busy} onClick={() => finish(false, true)}>
            Save draft & next item
          </Button>
        )}
      </div>
      {viewer && <PhotoViewer id={viewer} onClose={() => setViewer('')} />}
    </>
  );
}
