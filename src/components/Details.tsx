import { useEffect, useRef, useState } from 'react';
import {
  type Inventory,
  type Item,
  id,
  money,
  itemTotal,
  parsePrice,
  title,
  validateItem,
} from '../lib/model';
import { mutate, getAsset, errorMessage } from '../lib/db';
import { prepareAsset, downloadBlob } from '../lib/media';
import { readReceipt } from '../lib/ocr';
import { Back, Button, Field, FilePicker, Photo, PhotoViewer, Badge, go } from './shared';
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
}: {
  data: Inventory;
  item: Item;
  run: Run;
  session?: boolean;
}) {
  const [form, setForm] = useState<Form>(() => toForm(item)),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [saveStatus, setSaveStatus] = useState(''),
    [viewer, setViewer] = useState('');
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
  function update(key: keyof Form, value: string | number) {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: value }));
    setSaveStatus('Unsaved changes');
  }
  async function persist(reviewed = false) {
    const { price, ...values } = current.current;
    const snapshot = current.current;
    const next = { ...values, unitPriceCents: parsePrice(price), reviewed };
    validateItem(next);
    await mutate((d) => {
      const i = d.items.find((i) => i.id === item.id);
      if (!i) throw Error('Item no longer exists.');
      Object.assign(i, { ...next, photos: i.photos, receipts: i.receipts });
    });
    if (current.current === snapshot) dirty.current = false;
    setSaveStatus(reviewed ? 'Reviewed and saved' : 'Draft saved on this device');
  }
  useEffect(() => {
    if (!dirty.current) return;
    timer.current = setTimeout(() => {
      persist(false).catch((e) => setSaveStatus(`Not saved: ${errorMessage(e)}`));
    }, 600);
    return () => clearTimeout(timer.current);
  }, [form]);
  useEffect(() => {
    const warning = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warning);
    return () => {
      window.removeEventListener('beforeunload', warning);
      clearTimeout(timer.current);
      if (dirty.current) persist(false).catch(() => {});
    };
  }, []);
  async function finish(reviewed: boolean, next: boolean) {
    clearTimeout(timer.current);
    setBusy(true);
    const ok = await run(
      () => persist(reviewed),
      reviewed ? 'Item reviewed and saved' : 'Draft saved',
    );
    setBusy(false);
    if (ok) {
      if (next && pending.length) go(`/details/${pending[0]}?session`);
      else go(next ? `/room/${room.id}` : `/item/${item.id}`);
    }
  }
  async function attach(files: File[]) {
    setBusy(true);
    for (const file of files) {
      let rid = '';
      const ok = await run(async () => {
        const asset = await prepareAsset(file, file.name);
        rid = id();
        await mutate(
          (d) => {
            d.items
              .find((i) => i.id === item.id)!
              .receipts.push({ id: rid, assetId: asset.id, status: 'pending', text: '' });
          },
          [asset],
        );
      });
      if (!ok) break;
      await scan(rid);
    }
    setBusy(false);
  }
  async function scan(rid: string) {
    setBusy(true);
    setProgress('Reading receipt on this device…');
    await run(async () => {
      const fields = await readReceipt(item.id, rid, setProgress);
      if (fields) {
        dirty.current = true;
        setForm((f) => ({
          ...f,
          store: f.store || fields.store || '',
          purchaseDate: f.purchaseDate || fields.date || '',
        }));
      }
    });
    setProgress('');
    setBusy(false);
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
      <div className="row">
        <Button kind="text" disabled={busy} onClick={() => finish(false, false)}>
          Save draft & exit
        </Button>
        <span className="subtle">{room.name}</span>
        {session && (
          <Button kind="text" disabled={busy} onClick={() => finish(false, true)}>
            Skip
          </Button>
        )}
      </div>
      <header>
        <span className="eyebrow">
          {session ? `${pending.length + 1} ITEMS LEFT IN THIS SESSION` : 'ITEM DETAILS'}
        </span>
        <h1>{session ? 'One item at a time.' : 'The details matter.'}</h1>
        <p>Record what you know. Unknown details can stay blank.</p>
      </header>
      <div className="photo-strip large">
        {item.photos.map((p, n) => (
          <Photo key={p} id={p} alt={`Open item photo ${n + 1}`} onClick={() => setViewer(p)} />
        ))}
      </div>
      <div className="stack">
        <section className="card form-card">
          {fields([
            ['name', 'Item name'],
            ['category', 'Category'],
          ])}
        </section>
        <section className="card form-card">
          <div className="row">
            <h2>Receipts</h2>
            <Badge>{item.receipts.length} attached</Badge>
          </div>
          <p>
            Read price, date and store on this device. Check every suggestion; receipts can contain
            several purchases.
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
                    Is this amount for one unit, or all {form.quantity} units of this item? Ignore
                    it if it includes other purchases.
                  </p>
                  <div className="button-row">
                    <Button
                      kind="secondary"
                      disabled={busy}
                      onClick={() => update('price', (r.amount! / 100).toFixed(2))}
                    >
                      Use as unit price
                    </Button>
                    <Button
                      kind="secondary"
                      disabled={busy || !Number.isInteger(form.quantity) || form.quantity < 1}
                      onClick={() =>
                        update('price', (Math.round(r.amount! / form.quantity) / 100).toFixed(2))
                      }
                    >
                      Divide by {form.quantity}
                    </Button>
                  </div>
                  {form.quantity > 1 && (
                    <small>Division rounds the unit price to the nearest cent.</small>
                  )}
                </div>
              )}
              <div className="button-row">
                <Button
                  kind="text"
                  onClick={() =>
                    run(async () => {
                      const asset = await getAsset(r.assetId);
                      if (asset) downloadBlob(asset.original, asset.name);
                    })
                  }
                >
                  View original
                </Button>
                <Button kind="text" disabled={busy} onClick={() => scan(r.id)}>
                  Read again
                </Button>
                <Button
                  kind="text danger"
                  disabled={busy}
                  onClick={() =>
                    run(
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
            ['serialNumber', 'Serial number'],
          ])}
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
          <span>
            Reviewed means you’ve checked the available information. Missing dates, prices and
            receipts remain clearly unrecorded.
          </span>
        </div>
        <p className="save-state" role="status">
          {saveStatus || 'Changes are saved as a draft as you type.'}
        </p>
        <Button disabled={busy} onClick={() => finish(true, session)}>
          {session ? 'Mark reviewed & next item' : 'Save reviewed record'}
        </Button>
        <Button kind="secondary" disabled={busy} onClick={() => finish(false, session)}>
          {session ? 'Save draft & next item' : 'Save as draft'}
        </Button>
      </div>
      {viewer && <PhotoViewer id={viewer} onClose={() => setViewer('')} />}
    </>
  );
}
export function ItemRecord({ data, item, run }: { data: Inventory; item: Item; run: Run }) {
  const [active, setActive] = useState(item.photos[0] ?? ''),
    [viewer, setViewer] = useState(''),
    [busy, setBusy] = useState(false);
  const room = data.rooms.find((r) => r.id === item.roomId)!,
    property = data.properties.find((p) => p.id === room.propertyId)!;
  const dl = (rows: [string, string | number][]) => (
    <dl className="card record">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || 'Not recorded'}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <>
      <div className="row">
        <Back to={`/room/${room.id}`}>{room.name}</Back>
        <Button kind="text" onClick={() => go(`/details/${item.id}`)}>
          Edit
        </Button>
      </div>
      <Photo
        id={active}
        className="item-hero"
        alt="Open original photo"
        onClick={() => setViewer(active)}
      />
      <div className="photo-strip">
        {item.photos.map((p, n) => (
          <Photo key={p} id={p} alt={`Select photo ${n + 1}`} onClick={() => setActive(p)} />
        ))}
      </div>
      <FilePicker
        label="Add item photos"
        multiple
        disabled={busy}
        onFiles={async (files) => {
          setBusy(true);
          await run(async () => {
            for (const f of files) {
              const a = await prepareAsset(f, f.name);
              await mutate((d) => d.items.find((i) => i.id === item.id)!.photos.push(a.id), [a]);
            }
          });
          setBusy(false);
        }}
      />
      <header>
        <Badge warn={!item.reviewed}>{item.reviewed ? 'Reviewed' : 'Needs details'}</Badge>
        <h1>{title(item)}</h1>
        <p>{[item.category, room.name, property.name].filter(Boolean).join(' · ')}</p>
      </header>
      <h2>Purchase</h2>
      {dl([
        ['Price per unit', money(item.unitPriceCents)],
        ['Quantity', item.quantity],
        [
          'Item purchase total',
          item.unitPriceCents === null ? 'Not recorded' : money(itemTotal(item)),
        ],
        ['Purchased', item.purchaseDate],
        ['Where purchased', item.store],
      ])}
      <section className="card form-card">
        <h3>Receipts</h3>
        {item.receipts.length ? (
          item.receipts.map((r, n) => (
            <Button
              key={r.id}
              kind="secondary"
              onClick={() =>
                run(async () => {
                  const a = await getAsset(r.assetId);
                  if (a) downloadBlob(a.original, a.name);
                })
              }
            >
              View receipt {n + 1}
            </Button>
          ))
        ) : (
          <p>No receipt attached</p>
        )}
      </section>
      <h2>Identification</h2>
      {dl([
        ['Brand', item.brand],
        ['Model', item.model],
        ['Serial number', item.serialNumber],
      ])}
      <h2>Condition & notes</h2>
      {dl([
        ['Condition', item.condition],
        ['Notes', item.notes],
      ])}
      <details className="card form-card">
        <summary>Organize photos</summary>
        <p>
          Move a photo back to sorting, or make it the first photo. Details and receipts stay with
          this record.
        </p>
        {item.photos.map((p, n) => (
          <div className="row" key={p}>
            <Photo id={p} />
            <span>Photo {n + 1}</span>
            <Button
              kind="text"
              disabled={n === 0}
              onClick={() =>
                run(
                  () =>
                    mutate((d) => {
                      const i = d.items.find((i) => i.id === item.id)!;
                      i.photos = [p, ...i.photos.filter((x) => x !== p)];
                    }),
                  'Cover photo changed',
                )
              }
            >
              Make first
            </Button>
            <Button
              kind="text"
              disabled={item.photos.length < 2}
              onClick={() =>
                run(
                  () =>
                    mutate((d) => {
                      const i = d.items.find((i) => i.id === item.id)!;
                      i.photos = i.photos.filter((x) => x !== p);
                      d.rooms.find((r) => r.id === i.roomId)!.unsortedPhotos.push(p);
                      if (active === p) setActive(i.photos[0]);
                    }),
                  'Photo returned to sorting',
                )
              }
            >
              Unsort
            </Button>
          </div>
        ))}
        <small>The last photo stays with the item so its details are preserved.</small>
      </details>
      {viewer && <PhotoViewer id={viewer} onClose={() => setViewer('')} />}
    </>
  );
}
