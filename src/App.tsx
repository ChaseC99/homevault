import { useEffect, useState } from 'react';
import {
  Settings2,
  Search,
  ChevronRight,
  LayoutGrid,
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { loadInventory, mutate, errorMessage } from './lib/db';
import { type Inventory, type Property, type Room, stats, money, title } from './lib/model';
import { checkOffline } from './lib/offline';
import { prepareAsset } from './lib/media';
import { PropertyForm, AddRooms, Settings, type Run } from './components/Setup';
import { Capture, CaptureSetup } from './components/Capture';
import { Sort } from './components/Sort';
import { Details, ItemRecord } from './components/Details';
import { Reports } from './components/Reports';
import {
  Back,
  Button,
  Badge,
  Empty,
  Photo,
  PhotoViewer,
  FilePicker,
  Camera,
  House,
  FileText,
  Plus,
  X,
  go,
} from './components/shared';
function Status({ s }: { s: ReturnType<typeof stats> }) {
  return (
    <Badge warn={s.unsorted > 0 || s.needs > 0}>
      {s.unsorted
        ? `${s.unsorted} to sort`
        : s.needs
          ? `${s.needs} need details`
          : s.ready
            ? 'Report ready'
            : 'Walkthrough ahead'}
    </Badge>
  );
}
function Properties({ data, offline }: { data: Inventory; offline: string }) {
  const [search, setSearch] = useState('');
  const properties = data.properties.filter((p) =>
    [p.name, p.address, p.clientName].join(' ').toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="home-heading">
        <div>
          <div className="eyebrow">A LITTLE ORDER. A LOT OF PEACE OF MIND.</div>
          <h1>Properties</h1>
          <div className="header-meta">
            <span>
              {data.properties.length} {data.properties.length === 1 ? 'property' : 'properties'}
            </span>
            <Badge>{offline}</Badge>
          </div>
        </div>
        <Button onClick={() => go('/new')}>
          <Plus size={18} />
          New property
        </Button>
      </header>
      {data.properties.length > 0 && (
        <label className="search">
          <Search size={20} />
          <input
            type="search"
            aria-label="Search properties"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search properties, clients or addresses"
          />
        </label>
      )}
      {!data.properties.length ? (
        <>
          <div className="welcome-card">
            <div className="house-art" aria-hidden="true">
              <div className="art-grid" />
              <House size={104} strokeWidth={0.8} />
              <span className="art-check">
                <CheckCircle2 size={24} />
              </span>
            </div>
            <span className="eyebrow">WELCOME TO YOUR HOMEVAULT</span>
            <h2>
              Every home has a story.
              <br />
              Let’s keep a record.
            </h2>
            <p>
              Photos, receipts, and the details that matter.
              <br />
              Together in one private inventory.
            </p>
            <Button onClick={() => go('/new')}>
              <Plus size={18} />
              Add your first property
            </Button>
            <small>Saved on this device. Yours to organize.</small>
          </div>
          <div className="workflow-grid">
            {[
              [Camera, 'Walk through', 'Photograph each room and its items.'],
              [LayoutGrid, 'Fill in the details', 'Add what you know, then review.'],
              [FileText, 'Pass it on', 'Make a clear PDF for your client.'],
            ].map(([Icon, label, copy]) => {
              const I = Icon as typeof Camera;
              return (
                <div key={String(label)}>
                  <I size={22} />
                  <strong>{String(label)}</strong>
                  <p>{String(copy)}</p>
                </div>
              );
            })}
          </div>
        </>
      ) : properties.length ? (
        <div className="property-grid">
          {properties.map((p) => {
            const s = stats(data, p.id);
            return (
              <button key={p.id} className="property-card" onClick={() => go(`/property/${p.id}`)}>
                <div className="property-image">
                  {p.coverPhoto ? (
                    <Photo id={p.coverPhoto} className="cover" />
                  ) : (
                    <div className="cover placeholder">
                      <House size={58} strokeWidth={1} />
                      <span>Exterior photo</span>
                    </div>
                  )}
                  <Status s={s} />
                </div>
                <div className="property-card-body">
                  <div className="row">
                    <h2>{p.name}</h2>
                    <strong className="money">{money(s.total)}</strong>
                  </div>
                  <p>{p.address || 'Address not recorded'}</p>
                  <div className="row">
                    <small>
                      {s.rooms.length} rooms · {s.items.length} items
                    </small>
                    <ChevronRight size={18} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty title="No matching properties">Try a different name or address.</Empty>
      )}
    </>
  );
}
function PropertyView({ data, property, run }: { data: Inventory; property: Property; run: Run }) {
  const s = stats(data, property.id);
  return (
    <>
      <Back to="/">Properties</Back>
      <div className="property-cover">
        <Photo id={property.coverPhoto} className="cover" />
        {!property.coverPhoto && (
          <span className="cover-label">
            <House size={44} />
            Your exterior photo goes here
          </span>
        )}
        <div className="cover-action">
          <FilePicker
            label={property.coverPhoto ? 'Change cover' : 'Add cover photo'}
            onFiles={(f) =>
              run(async () => {
                if (!f[0]) return;
                const a = await prepareAsset(f[0], f[0].name);
                await mutate(
                  (d) => {
                    d.properties.find((p) => p.id === property.id)!.coverPhoto = a.id;
                  },
                  [a],
                );
              }, 'Cover photo saved')
            }
          />
        </div>
      </div>
      <header className="row align-start">
        <div>
          <h1>{property.name}</h1>
          <p>
            {property.address || 'Address not recorded'}
            {property.policyNumber ? ' · Policy on file' : ''}
          </p>
        </div>
        <Button kind="text" onClick={() => go(`/edit-property/${property.id}`)}>
          Info
        </Button>
      </header>
      <div className="stats">
        <div>
          <strong>{money(s.total)}</strong>
          <span>documented</span>
        </div>
        <div>
          <strong>{s.items.length}</strong>
          <span>item records</span>
        </div>
        <div className={s.needs ? 'warn' : ''}>
          <strong>{s.needs}</strong>
          <span>need details</span>
        </div>
      </div>
      <div className="section-head">
        <h2>Rooms</h2>
        <Button kind="soft" onClick={() => go(`/rooms/${property.id}`)}>
          <Plus size={18} />
          Add rooms
        </Button>
      </div>
      {s.rooms.length ? (
        <div className="card list">
          {s.rooms
            .sort((a, b) => a.order - b.order)
            .map((r) => {
              const rs = stats(data, property.id, r.id);
              return (
                <button className="list-row" key={r.id} onClick={() => go(`/room/${r.id}`)}>
                  <Photo id={r.roomPhotos[0] ?? rs.items[0]?.photos[0]} />
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <small>
                      {rs.unsorted
                        ? `${rs.unsorted} photos to sort`
                        : rs.items.length
                          ? `${rs.items.length} items · ${rs.needs ? `${rs.needs} need details` : 'all reviewed'}`
                          : r.roomPhotos.length
                            ? 'Room photographed · no items yet'
                            : 'Not photographed yet'}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
        </div>
      ) : (
        <Empty
          title="Start with the rooms."
          action={<Button onClick={() => go(`/rooms/${property.id}`)}>Add rooms</Button>}
        >
          Create a place for each part of the walkthrough.
        </Empty>
      )}
      <Button kind="secondary" onClick={() => go(`/reports/${property.id}`)}>
        <FileText size={18} />
        Build inventory report
      </Button>
      <small>Totals include recorded per-unit purchase prices × quantity.</small>
    </>
  );
}
function RoomView({ data, room, run }: { data: Inventory; room: Room; run: Run }) {
  const property = data.properties.find((p) => p.id === room.propertyId)!,
    s = stats(data, property.id, room.id),
    [viewer, setViewer] = useState(''),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(room.name);
  return (
    <>
      <div className="row">
        <Back to={`/property/${property.id}`}>{property.name}</Back>
      </div>
      <header>
        <div className="row">
          <h1>{room.name}</h1>
          <Button kind="text" onClick={() => setRenaming(!renaming)}>
            Rename
          </Button>
        </div>
        {renaming && (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const ok = await run(
                () =>
                  mutate((d) => {
                    d.rooms.find((r) => r.id === room.id)!.name = name.trim();
                  }),
                'Room renamed',
              );
              if (ok) setRenaming(false);
            }}
          >
            <input
              aria-label="Room name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit">Save</Button>
          </form>
        )}
        <p>
          {s.items.length} items · {money(s.total)} documented
        </p>
      </header>
      <div className="room-capture-actions">
        <button className="room-capture-action" onClick={() => go(`/capture/${room.id}?overview`)}>
          <House size={25} />
          <span>
            <strong>Add room overview shots</strong>
            <small>The room as a whole</small>
          </span>
          <ChevronRight size={19} />
        </button>
        <button className="room-capture-action primary" onClick={() => go(`/capture/${room.id}`)}>
          <Camera size={25} />
          <span>
            <strong>Add items</strong>
            <small>One item, a few angles</small>
          </span>
          <ChevronRight size={19} />
        </button>
      </div>
      <div>
        <div className="section-head">
          <h2>Room overview</h2>
          <small>
            {room.roomPhotos.length} {room.roomPhotos.length === 1 ? 'photo' : 'photos'}
          </small>
        </div>
        {room.roomPhotos.length ? (
          <div className="photo-strip large">
            {room.roomPhotos.map((p, n) => (
              <Photo key={p} id={p} alt={`Overview photo ${n + 1}`} onClick={() => setViewer(p)} />
            ))}
          </div>
        ) : (
          <p className="room-overview-empty">No overview shots yet.</p>
        )}
      </div>
      {s.unsorted > 0 && (
        <button className="action-card" onClick={() => go(`/sort/${room.id}`)}>
          <LayoutGrid size={24} />
          <span className="grow">
            <strong>{s.unsorted} photos to sort</strong>
            <small>Group photos of the same item</small>
          </span>
          <strong>Sort</strong>
        </button>
      )}
      {s.needs > 0 && (
        <button
          className="action-card warn"
          onClick={() => go(`/details/${s.items.find((i) => !i.reviewed)!.id}?session`)}
        >
          <FileText size={24} />
          <span className="grow">
            <strong>{s.needs} items need details</strong>
            <small>Receipts, prices, and the client’s knowledge</small>
          </span>
          <strong>Start</strong>
        </button>
      )}
      <div className="section-head">
        <h2>Items</h2>
        <small>Needs details first</small>
      </div>
      {s.items.length ? (
        <div className="card list">
          {[...s.items]
            .sort((a, b) => Number(a.reviewed) - Number(b.reviewed))
            .map((i) => (
              <button className="list-row" key={i.id} onClick={() => go(`/item/${i.id}`)}>
                <Photo id={i.photos[0]} />
                <span className="grow">
                  <strong>{title(i)}</strong>
                  <small>
                    {i.reviewed
                      ? [i.brand, i.receipts.length ? 'Receipt attached' : 'No receipt']
                          .filter(Boolean)
                          .join(' · ')
                      : `${i.photos.length} photos`}
                  </small>
                </span>
                {i.reviewed ? (
                  <strong className="money">
                    {i.unitPriceCents === null ? '—' : money(i.unitPriceCents * i.quantity)}
                  </strong>
                ) : (
                  <Badge warn>Needs details</Badge>
                )}
              </button>
            ))}
        </div>
      ) : (
        <Empty
          icon={<FolderOpen size={32} />}
          title={s.unsorted ? 'Ready to put it together.' : 'No items yet.'}
          action={
            s.unsorted ? (
              <Button onClick={() => go(`/sort/${room.id}`)}>Sort photos</Button>
            ) : undefined
          }
        >
          {s.unsorted
            ? 'Group your photos to create the first item.'
            : 'Tap Add items to photograph each item. Fill in the details later.'}
        </Empty>
      )}
      {viewer && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Room overview photo">
          <Button kind="secondary" onClick={() => setViewer('')}>
            <X />
            Close
          </Button>
          <Photo id={viewer} full className="original" />
          <Button
            onClick={() =>
              run(async () => {
                await mutate((d) => {
                  const r = d.rooms.find((r) => r.id === room.id)!;
                  r.roomPhotos = r.roomPhotos.filter((p) => p !== viewer);
                  r.unsortedPhotos.push(viewer);
                });
                setViewer('');
              }, 'Moved to item photos')
            }
          >
            Move to item photos for sorting
          </Button>
        </div>
      )}
    </>
  );
}
export default function App() {
  const [data, setData] = useState<Inventory>(),
    [route, setRoute] = useState(location.hash.slice(1) || '/'),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [offline, setOffline] = useState('Preparing offline…');
  const refresh = () =>
    loadInventory()
      .then(setData)
      .catch((e) => setError(`Could not open device storage: ${errorMessage(e)}`));
  const ready = () => {
    setOffline(import.meta.env.PROD ? 'Preparing offline…' : 'Development preview');
    checkOffline()
      .then((ok) =>
        setOffline(
          ok
            ? 'Ready offline'
            : import.meta.env.PROD
              ? 'Offline setup needed'
              : 'Development preview',
        ),
      )
      .catch((e) => {
        setOffline('Offline setup incomplete');
        setError(errorMessage(e));
      });
  };
  useEffect(() => {
    refresh();
    ready();
    const hash = () => {
      setRoute(location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('vault-change', refresh);
    window.addEventListener('online', ready);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('vault-change', refresh);
      window.removeEventListener('online', ready);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const run: Run = async (work, message) => {
    try {
      await work();
      if (message) setToast(message);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  const [kind, keyWithQuery] = route.replace(/^\//, '').split('/'),
    key = keyWithQuery?.split('?')[0],
    session = route.includes('?session');
  const p = data?.properties.find((p) => p.id === key),
    r = data?.rooms.find((r) => r.id === key),
    i = data?.items.find((i) => i.id === key);
  let screen;
  if (!data)
    screen = <Empty title="Opening your Homevault…">Loading records from this device.</Empty>;
  else if (kind === 'new' || (kind === 'edit-property' && p))
    screen = <PropertyForm key={key ?? 'new'} data={data} property={p} run={run} />;
  else if (kind === 'property' && p) screen = <PropertyView data={data} property={p} run={run} />;
  else if (kind === 'rooms' && p) screen = <AddRooms data={data} property={p} run={run} />;
  else if (kind === 'room' && r) screen = <RoomView key={r.id} data={data} room={r} run={run} />;
  else if (kind === 'capture' && r)
    screen = (
      <Capture key={route} data={data} room={r} overview={route.includes('?overview')} run={run} />
    );
  else if (kind === 'capture' && !key) screen = <CaptureSetup data={data} />;
  else if (kind === 'sort' && r) screen = <Sort data={data} room={r} run={run} />;
  else if (kind === 'details' && i)
    screen = <Details key={i.id} data={data} item={i} run={run} session={session} />;
  else if (kind === 'item' && i) screen = <ItemRecord key={i.id} data={data} item={i} run={run} />;
  else if (kind === 'reports') screen = <Reports data={data} initialProperty={key} run={run} />;
  else if (kind === 'settings')
    screen = <Settings data={data} run={run} offline={offline} retryOffline={ready} />;
  else if (!kind) screen = <Properties data={data} offline={offline} />;
  else
    screen = (
      <Empty
        title="This record isn’t here."
        action={<Button onClick={() => go('/')}>Back to properties</Button>}
      >
        Return to your properties to continue.
      </Empty>
    );
  const immersive = ['capture', 'details', 'sort', 'rooms', 'new', 'edit-property'].includes(kind);
  const cameraScreen = kind === 'capture' && !!r;
  return (
    <div className={`app ${cameraScreen ? 'camera-app' : ''}`}>
      {!cameraScreen && (
        <div className="brand-bar">
          <a href="#/" aria-label="Jigsaw Homevault home">
            <span className="brand-mark">
              <House size={21} />
            </span>
            <span>
              jigsaw<span className="brand-light"> / homevault</span>
            </span>
          </a>
          <button aria-label="Organizer and device settings" onClick={() => go('/settings')}>
            <Settings2 size={21} />
          </button>
        </div>
      )}
      <main
        className={`${!kind ? 'home' : 'detail'} ${cameraScreen ? 'capture-main' : ''}`}
        key={kind === 'capture' ? 'capture' : undefined}
      >
        {screen}
      </main>
      {!immersive && (
        <nav className="bottom-nav" aria-label="Main">
          <a href="#/" aria-current={kind !== 'reports' ? 'page' : undefined}>
            <House size={23} />
            <span>Properties</span>
          </a>
          <button
            className="nav-camera"
            aria-label="Start walkthrough camera"
            onClick={() => go('/capture')}
          >
            <Camera size={26} />
          </button>
          <a href="#/reports" aria-current={kind === 'reports' ? 'page' : undefined}>
            <FileText size={23} />
            <span>Reports</span>
          </a>
        </nav>
      )}
      {toast && !cameraScreen && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
