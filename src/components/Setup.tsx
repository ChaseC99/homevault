import { useState, useEffect, type FormEvent } from 'react';
import { type Inventory, type Property, type Room, id, newRoom, roomTypes } from '../lib/model';
import { mutate, requestPersistence, storageInfo } from '../lib/db';
import { prepareAsset } from '../lib/media';
import { LocateFixed } from 'lucide-react';
import { Back, Button, Camera, Field, FilePicker, Photo, Plus, X, go } from './shared';
export type Run = (work: () => Promise<unknown>, message?: string) => Promise<boolean>;
export function PropertyForm({
  data,
  property,
  run,
}: {
  data: Inventory;
  property?: Property;
  run: Run;
}) {
  const [form, setForm] = useState<Property>(
    property ?? {
      id: id(),
      name: '',
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      address: '',
      insurer: '',
      policyNumber: '',
      agentName: '',
      agentPhone: '',
      walkthroughStartDate: '',
      walkthroughEndDate: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );
  const [cover, setCover] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  async function locate() {
    setLocating(true);
    setLocationError('');
    try {
      if (!navigator.geolocation)
        throw Error('Location is unavailable in this browser. You can enter the address manually.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        }),
      );
      const { latitude, longitude, accuracy } = position.coords;
      setForm((f) => ({ ...f, location: { latitude, longitude, accuracy } }));
    } catch (error) {
      const code = (error as GeolocationPositionError).code;
      setLocationError(
        code === 1
          ? 'Location permission is off. Allow location in your browser or enter the address manually.'
          : 'Could not find your location. Try again or enter the address manually.',
      );
    } finally {
      setLocating(false);
    }
  }
  const fields = (keys: [Exclude<keyof Property, 'location'>, string, string?][]) =>
    keys.map(([key, label, type]) => (
      <Field key={key} label={label}>
        <input
          type={type ?? 'text'}
          value={form[key] ?? ''}
          required={key === 'name'}
          maxLength={key === 'address' ? 600 : 180}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </Field>
    ));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(async () => {
      if (!form.name.trim()) throw Error('Enter a property name.');
      if (
        form.walkthroughStartDate &&
        form.walkthroughEndDate &&
        form.walkthroughEndDate < form.walkthroughStartDate
      )
        throw Error('The end date must be on or after the start date.');
      const asset = cover ? await prepareAsset(cover, cover.name) : undefined;
      await mutate(
        (d) => {
          const p = {
            ...form,
            name: form.name.trim(),
            coverPhoto: asset?.id ?? form.coverPhoto,
            updatedAt: new Date().toISOString(),
          };
          const index = d.properties.findIndex((x) => x.id === p.id);
          if (index >= 0) d.properties[index] = p;
          else d.properties.push(p);
        },
        asset ? [asset] : [],
      );
    }, 'Property saved on this device');
    setBusy(false);
    if (ok) go(`/property/${form.id}`);
  }
  return (
    <>
      <Back to={property ? `/property/${property.id}` : '/'}>Cancel</Back>
      <header>
        <span className="eyebrow">PROPERTY SETUP</span>
        <h1>{property ? 'Property information' : 'A place for everything.'}</h1>
        <p>Start with the home. You can fill in the rest later.</p>
      </header>
      <form onSubmit={save} className="stack">
        <section className="card form-card">
          <h2>The property</h2>
          {fields([['name', 'Property name']])}
          <Field label="Street, city, state and ZIP">
            <textarea
              name="street-address"
              autoComplete="street-address"
              value={form.address}
              maxLength={600}
              rows={3}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Button kind="secondary" disabled={locating || busy} onClick={locate}>
            <LocateFixed size={18} />
            {locating ? 'Finding location…' : 'Add current location'}
          </Button>
          <small>
            Save your GPS location on this device. Enter or autofill the street address above.
          </small>
          {locationError && <p role="alert">{locationError}</p>}
          {form.location && (
            <div className="location-summary" role="status">
              <small>
                GPS: {form.location.latitude.toFixed(5)}, {form.location.longitude.toFixed(5)} ·
                accuracy about {Math.round(form.location.accuracy)} m
              </small>
              <Button kind="text" onClick={() => setForm((f) => ({ ...f, location: undefined }))}>
                Remove location
              </Button>
            </div>
          )}
          {form.coverPhoto && <Photo id={form.coverPhoto} className="cover small" />}
          <FilePicker
            icon={<Camera size={18} />}
            label={cover ? `Selected: ${cover.name}` : 'Choose exterior photo'}
            onFiles={(f) => setCover(f[0])}
          />
        </section>
        <section className="card form-card">
          <h2>Client</h2>
          {fields([
            ['clientName', 'Client / policyholder name'],
            ['clientPhone', 'Phone', 'tel'],
            ['clientEmail', 'Email', 'email'],
          ])}
        </section>
        {property && (
          <section className="card form-card">
            <h2>Insurance</h2>
            {fields([
              ['insurer', 'Insurer'],
              ['policyNumber', 'Policy number'],
              ['agentName', 'Agent name'],
              ['agentPhone', 'Agent phone', 'tel'],
            ])}
          </section>
        )}
        <section className="card form-card">
          <h2>Walkthrough dates</h2>
          <div className="fields two date-fields">
            {fields([
              ['walkthroughStartDate', 'Started', 'date'],
              ['walkthroughEndDate', 'Finished', 'date'],
            ])}
          </div>
        </section>
        <Button type="submit" disabled={busy || locating}>
          {busy ? 'Saving…' : 'Save property'}
        </Button>
        <small>{data.properties.length} properties currently on this device</small>
      </form>
    </>
  );
}
export function AddRooms({
  data,
  property,
  run,
}: {
  data: Inventory;
  property: Property;
  run: Run;
}) {
  const [added, setAdded] = useState<Room[]>([]),
    [custom, setCustom] = useState(''),
    [busy, setBusy] = useState(false);
  function add(type: string, name?: string) {
    setAdded((a) => [...a, newRoom(property.id, type, [...data.rooms, ...a], name)]);
  }
  return (
    <>
      <Back to={`/property/${property.id}`}>Cancel</Back>
      <header>
        <h1>Add rooms</h1>
        <p>Tap a room type. Tap again for another; we’ll add the numbers.</p>
      </header>
      <div className="room-grid">
        {roomTypes.map((type) => {
          const n = [...data.rooms, ...added].filter(
            (r) => r.propertyId === property.id && r.type === type,
          ).length;
          return (
            <button key={type} className="room-tile" onClick={() => add(type)}>
              <Plus size={19} />
              <strong>{type}</strong>
              <small>{n ? `${n} in home` : 'None yet'}</small>
            </button>
          );
        })}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) {
            add('Custom', custom.trim());
            setCustom('');
          }
        }}
      >
        <Field label="Or name your own">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={100}
            placeholder="Sunroom, Wine cellar…"
          />
        </Field>
        <Button type="submit" kind="secondary" disabled={!custom.trim()}>
          Add
        </Button>
      </form>
      <div className="sticky-action room-selection">
        <section className="stack" aria-label="Pending rooms">
          <h2>Adding to {property.name}</h2>
          <div className="chips pending-rooms" aria-live="polite">
            {added.length ? (
              added.map((r) => (
                <span className="chip" key={r.id}>
                  {r.name}
                  <button
                    aria-label={`Remove ${r.name}`}
                    onClick={() => setAdded(added.filter((x) => x.id !== r.id))}
                  >
                    <X size={16} />
                  </button>
                </span>
              ))
            ) : (
              <p>No rooms selected yet.</p>
            )}
          </div>
        </section>
        <Button
          disabled={!added.length || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run(() => mutate((d) => d.rooms.push(...added)), 'Rooms saved');
            setBusy(false);
            if (ok) go(`/property/${property.id}`);
          }}
        >
          Add {added.length} {added.length === 1 ? 'room' : 'rooms'}
        </Button>
      </div>
    </>
  );
}
export function Settings({
  data,
  run,
  offline,
  retryOffline,
}: {
  data: Inventory;
  run: Run;
  offline: string;
  retryOffline: () => void;
}) {
  const [form, setForm] = useState(data.organizer),
    [storage, setStorage] = useState<Awaited<ReturnType<typeof storageInfo>>>();
  const check = () => storageInfo().then(setStorage);
  useEffect(() => {
    check().catch(() => {});
  }, []);
  return (
    <>
      <Back to="/">Properties</Back>
      <header>
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>Organizer & device</h1>
        <p>Your name and business appear on inventory reports.</p>
      </header>
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(
            () =>
              mutate((d) => {
                d.organizer = form;
              }),
            'Organizer information saved',
          );
        }}
      >
        {(['name', 'business', 'email', 'phone'] as const).map((key) => (
          <Field
            key={key}
            label={
              { name: 'Organizer name', business: 'Business', email: 'Email', phone: 'Phone' }[key]
            }
          >
            <input
              value={form[key]}
              maxLength={180}
              type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Button type="submit">Save organizer information</Button>
      </form>
      <section className="card form-card">
        <h2>Ready when you are</h2>
        <strong>{offline}</strong>
        <p>
          Open this app online once and wait for “Ready offline” before a visit. The reader, fonts
          and report tools are included.
        </p>
        <Button kind="secondary" onClick={retryOffline}>
          Check offline readiness
        </Button>
        <hr />
        <h2>Device storage</h2>
        <p>
          {storage
            ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB used${storage.quota ? ` of approximately ${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB available to this browser` : ''}.`
            : 'Checking storage…'}
        </p>
        <p>
          {storage?.persistent
            ? 'Persistent storage permission is enabled.'
            : 'The browser is using best-effort storage.'}{' '}
          Clearing site data or removing the app can erase the inventory. Export reports regularly;
          PDFs are records, not restorable backups.
        </p>
        <Button
          kind="secondary"
          onClick={() =>
            run(async () => {
              await requestPersistence();
              await check();
            }, 'Storage permission checked')
          }
        >
          Request persistent storage
        </Button>
      </section>
      <section className="card form-card">
        <h2>Install on your phone</h2>
        <p>
          iPhone: open in Safari, use Share, then Add to Home Screen. Android: use the browser’s
          Install app action.
        </p>
        <p>
          Camera access requires HTTPS on your phone. Localhost works on this computer. All saved
          information stays in this browser on this device.
        </p>
      </section>
    </>
  );
}
