import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ImageIcon, MoreHorizontal, X } from 'lucide-react';
import { captureItemPhoto, type Inventory, type Room } from '../lib/model';
import { mutate, storageInfo } from '../lib/db';
import { prepareAsset } from '../lib/media';
import { Back, Button, Field, FilePicker, Photo, PhotoViewer, Camera, go } from './shared';
import type { Run } from './Setup';

type StillCapture = { takePhoto: () => Promise<Blob> };
type Group = { itemId?: string; number: number; photos: string[] };

export function CaptureSetup({ data }: { data: Inventory }) {
  const [propertyId, setPropertyId] = useState(data.properties[0]?.id ?? '');
  const [roomId, setRoomId] = useState('');
  const rooms = data.rooms.filter((r) => r.propertyId === propertyId);
  return (
    <>
      <Back to="/">Properties</Back>
      <header>
        <h1>Choose a room</h1>
        <p>Where are you taking photos?</p>
      </header>
      <div className="card form-card">
        <Field label="Property">
          <select
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setRoomId('');
            }}
          >
            {!data.properties.length && <option value="">No properties yet</option>}
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {!!rooms.length && (
          <Field label="Room">
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select a room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {rooms.length ? (
          <Button disabled={!roomId} onClick={() => go(`/room/${roomId}`)}>
            Continue <ArrowRight size={18} />
          </Button>
        ) : (
          <Button onClick={() => go(propertyId ? `/rooms/${propertyId}` : '/new')}>
            {propertyId ? 'Add rooms' : 'New property'}
          </Button>
        )}
      </div>
    </>
  );
}

export function Capture({
  data,
  room,
  overview,
  run,
}: {
  data: Inventory;
  room: Room;
  overview: boolean;
  run: Run;
}) {
  const [group, setGroup] = useState<Group>(() => ({
    number: data.items.filter((i) => i.roomId === room.id).length + 1,
    photos: [],
  }));
  const [undoGroup, setUndoGroup] = useState<Group>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [quality, setQuality] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [notice, setNotice] = useState<{ text: string; failed?: boolean }>();
  const [options, setOptions] = useState(false);
  const [viewer, setViewer] = useState('');
  const [overviewPhotos, setOverviewPhotos] = useState(room.roomPhotos);
  const video = useRef<HTMLVideoElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const optionsDialog = useRef<HTMLDialogElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const still = useRef<StillCapture | undefined>(undefined);
  const alive = useRef(true);
  const locked = useRef(false);
  const requestId = useRef(0);
  const photos = overview ? overviewPhotos : group.photos;
  const latest = photos.at(-1);

  function stop() {
    requestId.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    still.current = undefined;
    setCamera(false);
    setOpening(false);
  }

  async function start() {
    const request = ++requestId.current;
    setOpening(true);
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error('Live camera is unavailable in this browser.');
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      });
      if (!alive.current || request !== requestId.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const C = (
        window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => StillCapture }
      ).ImageCapture;
      if (C) {
        try {
          still.current = new C(s.getVideoTracks()[0]);
        } catch {
          /* use video frame */
        }
      }
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      if (!alive.current || request !== requestId.current) return;
      setQuality(
        still.current
          ? 'Still-photo capture is available.'
          : 'Live photos use video resolution. Use phone camera for a native still.',
      );
      setCamera(true);
    } catch (e) {
      if (!alive.current || request !== requestId.current) return;
      stop();
      setCameraError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera access is off.'
          : e instanceof DOMException && e.name === 'NotFoundError'
            ? 'No live camera is available.'
            : 'The live camera could not open.',
      );
    } finally {
      if (alive.current && request === requestId.current) setOpening(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    void start();
    storageInfo()
      .then((s) => {
        if (alive.current && s.quota && s.quota - s.usage < 150 * 1024 * 1024)
          setStorageWarning('Device storage is getting low. Make space before a long walkthrough.');
      })
      .catch(() => {});
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      requestId.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  useEffect(() => {
    if (!notice || notice.failed) return;
    const timer = setTimeout(() => setNotice(undefined), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!undoGroup) return;
    const timer = setTimeout(() => setUndoGroup(undefined), 6500);
    return () => clearTimeout(timer);
  }, [undoGroup]);
  useEffect(() => {
    if (options) optionsDialog.current?.showModal();
    else optionsDialog.current?.close();
  }, [options]);

  // The lock spans preparation and persistence, so repeated taps cannot split
  // an in-flight capture or create parallel groups from stale React state.
  async function save(files: Blob[], names?: string[]) {
    let current = group;
    let saved = 0;
    setNotice(undefined);
    const ok = await run(async () => {
      for (let index = 0; index < files.length; index++) {
        const asset = await prepareAsset(
          files[index],
          names?.[index] ?? (overview ? 'Room overview' : 'Item photo'),
        );
        if (asset.type === 'application/pdf')
          throw Error('Choose photos here. PDFs belong with receipts.');
        let itemId = current.itemId;
        const committed = await mutate(
          (d) => {
            if (overview) {
              const target = d.rooms.find((r) => r.id === room.id);
              if (!target) throw Error('Room no longer exists.');
              target.roomPhotos.push(asset.id);
            } else itemId = captureItemPhoto(d, room.id, asset.id, current.itemId);
          },
          [asset],
        );
        saved++;
        if (overview) setOverviewPhotos(committed.rooms.find((r) => r.id === room.id)!.roomPhotos);
        else {
          current = { ...current, itemId, photos: [...current.photos, asset.id] };
          setGroup(current);
          setUndoGroup(undefined);
        }
      }
    });
    setNotice({
      text: ok
        ? `${saved === 1 ? 'Photo' : `${saved} photos`} saved`
        : `${saved} saved. Retry the remaining photos.`,
      failed: !ok,
    });
  }

  async function importPhotos(files: File[]) {
    if (!files.length || locked.current) return;
    locked.current = true;
    setBusy(true);
    setOptions(false);
    try {
      await save(
        files,
        files.map((f) => f.name),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function shoot() {
    if (locked.current) return;
    if (cameraError) {
      nativeInput.current?.click();
      return;
    }
    if (!camera) {
      void start();
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      let blob: Blob | undefined;
      if (still.current) {
        try {
          blob = await still.current.takePhoto();
        } catch {
          still.current = undefined;
          setQuality('Live photos use video resolution. Use phone camera for a native still.');
        }
      }
      if (!blob) {
        const v = video.current;
        if (!v?.videoWidth) throw Error('Camera is not ready. Open More camera options to retry.');
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d')!.drawImage(v, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(Error('Camera capture failed.'))),
            'image/jpeg',
            0.95,
          ),
        );
      }
      await save([blob]);
    } catch (e) {
      await run(async () => {
        throw e;
      });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function nextItem() {
    if (locked.current || !group.photos.length) return;
    setUndoGroup(group);
    setGroup({ number: group.number + 1, photos: [] });
    setNotice(undefined);
  }

  return (
    <div className="camera-screen">
      <div className="camera-top">
        <Button kind="ghost" disabled={busy} onClick={() => go(`/room/${room.id}`)}>
          Done
        </Button>
        <strong title={room.name}>{room.name}</strong>
        <button
          className="camera-more"
          aria-label="More camera options"
          aria-haspopup="dialog"
          disabled={busy}
          onClick={() => setOptions(true)}
        >
          <MoreHorizontal size={24} />
        </button>
      </div>
      <div className="capture-context" aria-live="polite" aria-atomic="true">
        <span className="capture-label">{overview ? 'ROOM OVERVIEW' : 'ITEM PHOTOS'}</span>
        <h1>
          {overview
            ? `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
            : `Item ${group.number} · ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}
        </h1>
      </div>
      <div className="viewfinder">
        <video ref={video} muted playsInline autoPlay aria-label="Live camera preview" />
        {!camera && (
          <div className="camera-prompt">
            <Camera size={36} strokeWidth={1.3} />
            <p>{opening ? 'Opening camera…' : cameraError || 'Camera paused'}</p>
            {!opening && (
              <small>
                {cameraError
                  ? 'Tap the shutter to use your phone camera.'
                  : 'Tap the shutter to resume.'}
              </small>
            )}
            {!opening && cameraError && (
              <FilePicker label="Import photos" multiple disabled={busy} onFiles={importPhotos} />
            )}
          </div>
        )}
        {storageWarning && (
          <p className="camera-warning" role="alert">
            {storageWarning}
          </p>
        )}
      </div>
      <div className="capture-bottom">
        <div className="capture-feedback" role="status" aria-live="polite">
          {busy ? (
            'Saving…'
          ) : undoGroup ? (
            <>
              <span>New item started</span>
              <button
                onClick={() => {
                  if (locked.current) return;
                  setGroup(undoGroup);
                  setUndoGroup(undefined);
                }}
              >
                Undo
              </button>
            </>
          ) : (
            notice?.text
          )}
        </div>
        <div className="capture-controls">
          <div className="capture-thumbnail">
            {latest ? (
              <Photo id={latest} alt="Review latest photo" onClick={() => setViewer(latest)} />
            ) : (
              <span className="empty-thumbnail" aria-hidden="true">
                <ImageIcon size={23} />
              </span>
            )}
          </div>
          <button
            className={`shutter ${busy ? 'saving' : ''}`}
            aria-label={overview ? 'Take room photo' : 'Take item photo'}
            disabled={busy || opening}
            onClick={shoot}
          >
            <span />
          </button>
          {overview ? (
            <span />
          ) : (
            <button
              className="next-item"
              disabled={busy || !group.photos.length}
              onClick={nextItem}
            >
              Next item <ArrowRight size={16} />
            </button>
          )}
        </div>
        <p className="capture-tip">
          {overview
            ? 'Capture the whole room.'
            : 'Same item? Keep shooting. New item? Tap Next item.'}
        </p>
      </div>
      <input
        ref={nativeInput}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Phone camera photo"
        onChange={(e) => {
          void importPhotos(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <dialog
        ref={optionsDialog}
        className="camera-options"
        aria-labelledby="camera-options-title"
        onCancel={() => setOptions(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOptions(false);
        }}
      >
        <div className="camera-options-body">
          <div className="row">
            <h2 id="camera-options-title">Camera options</h2>
            <button
              className="camera-more"
              aria-label="Close camera options"
              onClick={() => setOptions(false)}
            >
              <X size={22} />
            </button>
          </div>
          <FilePicker label="Import photos" multiple disabled={busy} onFiles={importPhotos} />
          <Button
            kind="secondary"
            disabled={busy}
            onClick={() => {
              stop();
              setOptions(false);
              nativeInput.current?.click();
            }}
          >
            Use phone camera
          </Button>
          {!camera && (
            <Button
              kind="secondary"
              disabled={opening || busy}
              onClick={() => {
                setOptions(false);
                void start();
              }}
            >
              Retry live camera
            </Button>
          )}
          {quality && <p>{quality}</p>}
        </div>
      </dialog>
      {viewer && <PhotoViewer id={viewer} onClose={() => setViewer('')} />}
    </div>
  );
}
