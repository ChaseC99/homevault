import { useEffect, useRef, useState } from 'react';
import {
  Settings2,
  Search,
  ChevronRight,
  LayoutGrid,
  ArrowUpRight,
  CheckCircle2,
  MoreHorizontal,
} from 'lucide-react';
import { loadInventory, mutate, errorMessage, deleteRoom, deleteProperty } from './lib/db';
import { type Inventory, type Property, type Room, stats, money, title } from './lib/model';
import { checkOffline } from './lib/offline';
import { useAppUpdates } from './lib/use-app-updates';
import { PropertyForm, AddRooms, Settings, type Run } from './components/Setup';
import { Capture, CaptureSetup } from './components/Capture';
import { Sort } from './components/Sort';
import { Details } from './components/Details';
import { canNavigate } from './lib/navigation';
import { LocationLink } from './components/LocationLink';
import { Reports } from './components/Reports';
import { DeleteConfirmation } from './components/DeleteConfirmation';
import { UpdateNotice } from './components/UpdateNotice';
import {
  Back,
  Button,
  Badge,
  Empty,
  Photo,
  usePhotoViewport,
  PageActions,
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
        ? `${s.unsorted} to label`
        : s.needs
          ? `${s.needs} need details`
          : s.ready
            ? 'Report ready'
            : 'Walkthrough ahead'}
    </Badge>
  );
}
function Properties({ data }: { data: Inventory }) {
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
                  {p.address && <p>{p.address}</p>}
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
function PropertyView({ data, property }: { data: Inventory; property: Property }) {
  const s = stats(data, property.id);
  const [options, setOptions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (options) dialog.current?.showModal();
    else dialog.current?.close();
  }, [options]);
  return (
    <>
      <Back to="/">Properties</Back>
      <PageActions>
        <button
          className="options-button"
          aria-label="Property options"
          aria-haspopup="dialog"
          onClick={() => setOptions(true)}
        >
          <MoreHorizontal size={22} />
        </button>
      </PageActions>
      <div className="property-cover">
        <Photo id={property.coverPhoto} className="cover" placeholder={null} />
        {!property.coverPhoto && (
          <span className="cover-label">
            <House size={44} />
            Your exterior photo goes here
          </span>
        )}
      </div>
      <header className="row align-start">
        <div>
          <h1>{property.name}</h1>
          {property.address && <p>{property.address}</p>}
          {property.location && <LocationLink location={property.location} />}
        </div>
        <Button kind="text" onClick={() => go(`/edit-property/${property.id}`)}>
          Edit
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
                        ? `${rs.unsorted} photos to label`
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
      <dialog
        ref={dialog}
        className="options-dialog"
        aria-label="Property options"
        onCancel={() => setOptions(false)}
      >
        <div className="row">
          <h2>Property options</h2>
          <button
            className="options-button"
            aria-label="Close property options"
            onClick={() => setOptions(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="stack">
          <Button kind="secondary" onClick={() => go(`/edit-property/${property.id}`)}>
            Edit property
          </Button>
          <Button
            kind="danger-text"
            onClick={() => {
              setOptions(false);
              setDeleting(true);
            }}
          >
            Delete property
          </Button>
        </div>
      </dialog>
      {deleting && (
        <DeleteConfirmation
          kind="property"
          name={property.name}
          contents={`, its ${s.rooms.length} ${s.rooms.length === 1 ? 'room' : 'rooms'}, ${s.items.length} ${s.items.length === 1 ? 'item' : 'items'}, photos, and receipts`}
          onDelete={() => deleteProperty(property.id)}
          onDeleted={() => go('/')}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}
function RoomView({ data, room, run }: { data: Inventory; room: Room; run: Run }) {
  const property = data.properties.find((p) => p.id === room.propertyId)!;
  const s = stats(data, property.id, room.id);
  const [viewer, setViewer] = useState('');
  const [options, setOptions] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  usePhotoViewport(!!viewer);
  const [filter, setFilter] = useState<'all' | 'needs'>('all');
  const [name, setName] = useState(room.name);
  const [busy, setBusy] = useState(false);
  const optionsDialog = useRef<HTMLDialogElement>(null);
  const cover = room.roomPhotos[0];
  const documentedValue = money(s.total).replace(/\.00$/, '');
  const visibleItems = [...s.items]
    .filter((item) => filter === 'all' || !item.reviewed)
    .sort((a, b) => Number(a.reviewed) - Number(b.reviewed));
  const hasPhotos =
    room.roomPhotos.length +
      s.unsorted +
      s.items.reduce((count, item) => count + item.photos.length, 0) >
    0;
  useEffect(() => {
    if (options) optionsDialog.current?.showModal();
    else optionsDialog.current?.close();
  }, [options]);
  function closeOptions() {
    setOptions(false);
    setRenaming(false);
  }
  return (
    <>
      <Back to={`/property/${property.id}`}>{property.name}</Back>
      <PageActions>
        <button
          className="options-button"
          aria-label="Room options"
          aria-haspopup="dialog"
          onClick={() => {
            setName(room.name);
            setOptions(true);
          }}
        >
          <MoreHorizontal size={22} />
        </button>
      </PageActions>
      <header className={`room-hero ${cover ? 'has-cover' : ''}`}>
        {cover && <Photo id={cover} full className="room-cover" alt={`${room.name} cover`} />}
        <div className="room-heading">
          <h1>{room.name}</h1>
          <p>
            {!hasPhotos && !s.items.length
              ? 'No photos yet'
              : `${s.items.length} ${s.items.length === 1 ? 'item' : 'items'} · ${documentedValue} documented`}
          </p>
        </div>
      </header>
      <div className="room-content">
        <section className="room-overview" aria-label="Room overview">
          <div className="room-overview-heading">
            <h2>
              <House size={19} aria-hidden="true" />
              Room overview
            </h2>
            <span>
              {room.roomPhotos.length} {room.roomPhotos.length === 1 ? 'photo' : 'photos'}
            </span>
          </div>
          <div className="photo-strip overview-strip">
            {room.roomPhotos.map((photo, index) => (
              <div className={`overview-thumbnail ${index === 0 ? 'is-cover' : ''}`} key={photo}>
                <Photo
                  id={photo}
                  alt={`Overview photo ${index + 1}`}
                  onClick={() => setViewer(photo)}
                />
                {index === 0 && <span className="cover-badge">Cover</span>}
              </div>
            ))}
            <button
              className="overview-add"
              aria-label="Add overview shots"
              onClick={() => go(`/capture/${room.id}?overview`)}
            >
              <Plus size={20} />
            </button>
          </div>
          {!room.roomPhotos.length && (
            <p className="overview-hint">Add a room photo to set its cover.</p>
          )}
        </section>

        <section className="room-inventory" aria-label="Room items">
          <div className="section-head room-items-heading">
            <h2>Items</h2>
            <span aria-label={`${s.items.length} items, ${documentedValue} documented`}>
              {s.items.length} · {documentedValue}
            </span>
          </div>
          {s.unsorted > 0 && (
            <div className="room-unlabeled">
              <div className="unlabeled-stack" aria-hidden="true">
                {room.unsortedPhotos.slice(0, 5).map((photo) => (
                  <Photo key={photo} id={photo} />
                ))}
              </div>
              <strong className="unlabeled-count">
                {s.unsorted}
                <span>unlabeled</span>
              </strong>
              <Button onClick={() => go(`/sort/${room.id}`)}>Label</Button>
            </div>
          )}
          <div className="room-item-controls">
            <div className="room-filters" role="group" aria-label="Filter items">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All {s.items.length}
              </button>
              <button
                className="needs-filter"
                aria-pressed={filter === 'needs'}
                onClick={() => setFilter('needs')}
              >
                Needs details {s.needs}
              </button>
            </div>
            {s.needs > 0 && (
              <button
                className="start-details"
                onClick={() => go(`/details/${s.items.find((item) => !item.reviewed)!.id}?session`)}
              >
                Start details
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {visibleItems.length ? (
            <div className="card list room-items">
              {visibleItems.map((item) => (
                <button className="list-row" key={item.id} onClick={() => go(`/item/${item.id}`)}>
                  <Photo id={item.photos[0]} />
                  <span className="grow">
                    <strong>{title(item)}</strong>
                    <small>
                      {item.photos.length} {item.photos.length === 1 ? 'photo' : 'photos'}
                    </small>
                  </span>
                  {item.reviewed ? (
                    <strong className="money">
                      {item.unitPriceCents === null
                        ? '—'
                        : money(item.unitPriceCents * item.quantity)}
                    </strong>
                  ) : (
                    <Badge warn>Needs details</Badge>
                  )}
                </button>
              ))}
            </div>
          ) : filter === 'needs' && s.items.length ? (
            <div className="empty room-empty">
              <h3>All items reviewed</h3>
              <p>There are no items needing details.</p>
              <Button kind="secondary" onClick={() => setFilter('all')}>
                Show all items
              </Button>
            </div>
          ) : (
            <div className="empty room-empty">
              <h3>No items yet</h3>
              {s.unsorted > 0 && <p>Label your photos to add them to this room.</p>}
              <Button onClick={() => go(`/capture/${room.id}`)}>
                <Camera size={18} /> Add items
              </Button>
            </div>
          )}
        </section>
      </div>
      <dialog
        ref={optionsDialog}
        className="options-dialog"
        aria-label="Room options"
        onCancel={closeOptions}
      >
        <div className="row">
          <h2>{renaming ? 'Rename room' : 'Room options'}</h2>
          <button className="options-button" aria-label="Close room options" onClick={closeOptions}>
            <X size={20} />
          </button>
        </div>
        {renaming ? (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim() || busy) return;
              setBusy(true);
              const ok = await run(
                () =>
                  mutate((d) => {
                    d.rooms.find((r) => r.id === room.id)!.name = name.trim();
                  }),
                'Room renamed',
              );
              setBusy(false);
              if (ok) closeOptions();
            }}
          >
            <label className="field">
              Room name
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy || !name.trim()}>
              Save
            </Button>
          </form>
        ) : (
          <div className="stack">
            <Button kind="secondary" onClick={() => setRenaming(true)}>
              Rename room
            </Button>
            <Button kind="secondary" onClick={() => go(`/capture/${room.id}?overview`)}>
              Add overview shots
            </Button>
            <Button kind="secondary" onClick={() => go(`/capture/${room.id}`)}>
              Add items
            </Button>
            <Button
              kind="danger-text"
              onClick={() => {
                closeOptions();
                setDeleting(true);
              }}
            >
              Delete room
            </Button>
          </div>
        )}
      </dialog>
      {deleting && (
        <DeleteConfirmation
          kind="room"
          name={room.name}
          contents={`, its ${s.items.length} ${s.items.length === 1 ? 'item' : 'items'}, photos, and receipts`}
          onDelete={() => deleteRoom(room.id)}
          onDeleted={() => go(`/property/${property.id}`)}
          onCancel={() => setDeleting(false)}
        />
      )}
      {viewer && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Room overview photo">
          <Button kind="secondary" onClick={() => setViewer('')}>
            <X />
            Close
          </Button>
          <Photo id={viewer} full className="original" />
          <Button
            disabled={viewer === cover}
            onClick={() =>
              run(async () => {
                await mutate((d) => {
                  const target = d.rooms.find((r) => r.id === room.id)!;
                  target.roomPhotos = [
                    viewer,
                    ...target.roomPhotos.filter((photo) => photo !== viewer),
                  ];
                });
                setViewer('');
              }, 'Room cover changed')
            }
          >
            {viewer === cover ? 'Current cover' : 'Make room cover'}
          </Button>
          <Button
            onClick={() =>
              run(async () => {
                await mutate((d) => {
                  const target = d.rooms.find((r) => r.id === room.id)!;
                  target.roomPhotos = target.roomPhotos.filter((photo) => photo !== viewer);
                  target.unsortedPhotos.push(viewer);
                });
                setViewer('');
              }, 'Moved to item photos')
            }
          >
            Move to item photos for labeling
          </Button>
        </div>
      )}
    </>
  );
}
export default function App() {
  const updates = useAppUpdates();
  const [data, setData] = useState<Inventory>(),
    [route, setRoute] = useState(location.hash.slice(1) || '/'),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [offline, setOffline] = useState('Preparing offline…'),
    [scrolled, setScrolled] = useState(window.scrollY > 8);
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
    let currentURL = location.href;
    let navigation = 0;
    const hash = async () => {
      const request = ++navigation;
      const destination = location.href;
      const allowed = await canNavigate();
      if (request !== navigation) return;
      if (!allowed) {
        history.replaceState(null, '', currentURL);
        return;
      }
      currentURL = destination;
      setRoute(new URL(destination).hash.slice(1) || '/');
      setToast('');
      setScrolled(false);
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
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
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
  const [pathname, query = ''] = route.split('?');
  const [kind, key] = pathname.replace(/^\//, '').split('/');
  const params = new URLSearchParams(query);
  const session = params.has('session');
  const p = data?.properties.find((p) => p.id === key),
    r = data?.rooms.find((r) => r.id === key),
    i = data?.items.find((i) => i.id === key);
  let screen;
  if (!data)
    screen = <Empty title="Opening your Homevault…">Loading records from this device.</Empty>;
  else if (kind === 'new' || (kind === 'edit-property' && p))
    screen = <PropertyForm key={key ?? 'new'} data={data} property={p} run={run} />;
  else if (kind === 'property' && p) screen = <PropertyView key={p.id} data={data} property={p} />;
  else if (kind === 'rooms' && p) screen = <AddRooms data={data} property={p} run={run} />;
  else if (kind === 'room' && r) screen = <RoomView key={r.id} data={data} room={r} run={run} />;
  else if (kind === 'capture' && r)
    screen = <Capture key={route} room={r} overview={params.has('overview')} run={run} />;
  else if (kind === 'capture' && !key)
    screen = (
      <CaptureSetup key={route} data={data} initialProperty={params.get('property') ?? undefined} />
    );
  else if (kind === 'sort' && r)
    screen = (
      <Sort
        key={r.id}
        data={data}
        room={r}
        run={run}
        editingItemId={params.get('item') ?? undefined}
      />
    );
  else if ((kind === 'details' || kind === 'item') && i)
    screen = <Details key={i.id} data={data} item={i} run={run} session={session} />;
  else if (kind === 'reports') screen = <Reports data={data} initialProperty={key} run={run} />;
  else if (kind === 'settings')
    screen = (
      <Settings data={data} run={run} offline={offline} retryOffline={ready} updates={updates} />
    );
  else if (!kind) screen = <Properties data={data} />;
  else
    screen = (
      <Empty
        title="This record isn’t here."
        action={<Button onClick={() => go('/')}>Back to properties</Button>}
      >
        Return to your properties to continue.
      </Empty>
    );
  const immersive = [
    'capture',
    'details',
    'item',
    'sort',
    'rooms',
    'new',
    'edit-property',
  ].includes(kind);
  const cameraScreen = kind === 'capture' && !!r;
  const roomScreen = kind === 'room' && !!r;
  const cameraRoom = roomScreen ? r : undefined;
  const cameraProperty = kind === 'property' ? p : undefined;
  return (
    <div className={`app ${cameraScreen ? 'camera-app' : ''} ${roomScreen ? 'room-app' : ''}`}>
      {!cameraScreen && (
        <nav
          className={`brand-bar ${roomScreen ? `room-nav ${r.roomPhotos.length ? 'has-cover' : ''} ${scrolled ? 'is-scrolled' : ''}` : ''}`}
          aria-label="Page navigation"
        >
          <div id="top-back" />
          {roomScreen ? (
            <div id="top-actions" />
          ) : (
            <>
              <a href="#/" aria-label="Jigsaw Homevault home">
                <span className="brand-mark">
                  <House size={21} />
                </span>
                <span>
                  jigsaw<span className="brand-light"> / homevault</span>
                </span>
              </a>
              {kind === 'property' && p ? (
                <div id="top-actions" />
              ) : (
                <button aria-label="Organizer and device settings" onClick={() => go('/settings')}>
                  <Settings2 size={21} />
                </button>
              )}
            </>
          )}
        </nav>
      )}
      <main
        className={`${!kind ? 'home' : 'detail'} ${cameraScreen ? 'capture-main' : ''} ${roomScreen ? 'room-main' : ''}`}
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
          <div className="nav-camera-group">
            <button
              className="nav-camera"
              aria-label={
                cameraRoom
                  ? `Take photos in ${cameraRoom.name}`
                  : cameraProperty
                    ? `Take photos at ${cameraProperty.name}`
                    : 'Start walkthrough camera'
              }
              onClick={() =>
                go(
                  cameraRoom
                    ? `/capture/${cameraRoom.id}`
                    : cameraProperty
                      ? `/capture?property=${cameraProperty.id}`
                      : '/capture',
                )
              }
            >
              <Camera size={26} />
            </button>
            {cameraRoom && <span className="nav-camera-label">{cameraRoom.name}</span>}
          </div>
          <a href="#/reports" aria-current={kind === 'reports' ? 'page' : undefined}>
            <FileText size={23} />
            <span>Reports</span>
          </a>
        </nav>
      )}
      <UpdateNotice visible={['', 'property', 'room'].includes(kind) && !toast} updates={updates} />
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
