import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MoreHorizontal, X } from 'lucide-react';
import { type Inventory, type Room } from '../lib/model';
import { mutate, storageInfo } from '../lib/db';
import { imageBitmap, prepareAsset } from '../lib/media';
import { Back, Button, Field, FilePicker, Photo, PhotoViewer, Camera, go } from './shared';
import type { Run } from './Setup';

type StillCapture = { takePhoto: () => Promise<Blob> };

export function CaptureSetup({
  data,
  initialProperty,
}: {
  data: Inventory;
  initialProperty?: string;
}) {
  const initial = data.properties.find((p) => p.id === initialProperty);
  const [propertyId, setPropertyId] = useState(initial?.id ?? data.properties[0]?.id ?? '');
  const [roomId, setRoomId] = useState('');
  const rooms = data.rooms.filter((r) => r.propertyId === propertyId);
  return (
    <>
      <Back to={initial ? `/property/${initial.id}` : '/'}>{initial?.name ?? 'Properties'}</Back>
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
          <Button disabled={!roomId} onClick={() => go(`/capture/${roomId}`)}>
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

export function Capture({ room, overview, run }: { room: Room; overview: boolean; run: Run }) {
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [quality, setQuality] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [notice, setNotice] = useState<{ text: string; failed?: boolean }>();
  const [options, setOptions] = useState(false);
  const [viewer, setViewer] = useState('');
  const [photos, setPhotos] = useState(overview ? room.roomPhotos : room.unsortedPhotos);
  const [zoom, setZoom] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 4, step: 0.1 });
  const [hardwareZoom, setHardwareZoom] = useState(false);
  const [zooming, setZooming] = useState(false);
  const zoomLock = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const viewfinder = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const nativeInput = useRef<HTMLInputElement>(null);
  const optionsDialog = useRef<HTMLDialogElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const still = useRef<StillCapture | undefined>(undefined);
  const alive = useRef(true);
  const locked = useRef(false);
  const requestId = useRef(0);
  const latest = photos.at(-1);

  function stop() {
    requestId.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    still.current = undefined;
    setCamera(false);
    setZoomOpen(false);
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
      const track = s.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
        zoom?: { min: number; max: number; step: number };
      };
      const range = capabilities?.zoom;
      setHardwareZoom(!!range && range.max > range.min);
      setZoomRange(range && range.max > range.min ? range : { min: 1, max: 4, step: 0.1 });
      setZoom((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? 1);
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
    const element = viewfinder.current;
    if (!element || !camera) return;
    const sizePreview = () => {
      const v = video.current;
      if (!v?.videoWidth || !v.videoHeight) return;
      const scale = Math.min(
        element.clientWidth / v.videoWidth,
        element.clientHeight / v.videoHeight,
      );
      setPreviewSize({ width: v.videoWidth * scale, height: v.videoHeight * scale });
    };
    const observer = new ResizeObserver(sizePreview);
    observer.observe(element);
    video.current?.addEventListener('resize', sizePreview);
    sizePreview();
    return () => {
      observer.disconnect();
      video.current?.removeEventListener('resize', sizePreview);
    };
  }, [camera]);
  useEffect(() => {
    if (options) optionsDialog.current?.showModal();
    else optionsDialog.current?.close();
  }, [options]);

  // The lock spans preparation and persistence, so repeated taps cannot split
  // an in-flight capture or duplicate a saved photo.
  async function save(files: Blob[], names?: string[]) {
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
        const committed = await mutate(
          (d) => {
            const target = d.rooms.find((r) => r.id === room.id);
            if (!target) throw Error('Room no longer exists.');
            (overview ? target.roomPhotos : target.unsortedPhotos).push(asset.id);
          },
          [asset],
        );
        saved++;
        const target = committed.rooms.find((r) => r.id === room.id)!;
        setPhotos(overview ? target.roomPhotos : target.unsortedPhotos);
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
    if (locked.current || zoomLock.current) return;
    if (cameraError) {
      nativeInput.current?.click();
      return;
    }
    if (!camera) {
      void start();
      return;
    }
    setZoomOpen(false);
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
      if (!hardwareZoom && zoom > 1) {
        const image = await imageBitmap(blob);
        try {
          const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
          const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width / zoom));
          canvas.height = Math.max(1, Math.round(height / zoom));
          canvas
            .getContext('2d')!
            .drawImage(
              image,
              (width - width / zoom) / 2,
              (height - height / zoom) / 2,
              width / zoom,
              height / zoom,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(Error('Could not zoom photo.'))),
              'image/jpeg',
              0.95,
            ),
          );
        } finally {
          if ('close' in image) image.close();
        }
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

  async function changeZoom(value: number) {
    if (locked.current || zoomLock.current) return;
    zoomLock.current = true;
    setZooming(true);
    try {
      if (hardwareZoom) {
        const track = stream.current?.getVideoTracks()[0];
        if (!track) return;
        await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      }
      setZoom(value);
    } catch {
      setNotice({
        text: 'Could not change zoom. Try again or use your phone camera.',
        failed: true,
      });
    } finally {
      zoomLock.current = false;
      setZooming(false);
    }
  }

  return (
    <div className="camera-screen">
      <div className="camera-top">
        <Button
          kind="ghost"
          disabled={busy}
          onClick={() => go(overview || !photos.length ? `/room/${room.id}` : `/sort/${room.id}`)}
        >
          Done
        </Button>
        <div className="camera-title">
          <h1 title={room.name}>{room.name}</h1>
          {overview && <span>Room overview</span>}
        </div>
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
      <div className="viewfinder" ref={viewfinder}>
        <div
          className="preview-frame"
          style={previewSize.width ? previewSize : { width: '100%', height: '100%' }}
        >
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Live camera preview"
            style={{ transform: !hardwareZoom ? `scale(${zoom})` : undefined }}
          />
        </div>
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
        <div className="camera-notices">
          {storageWarning && (
            <p className="camera-warning" role="alert">
              {storageWarning}
            </p>
          )}
          <div
            className={`capture-feedback ${notice?.failed ? '' : 'sr-only'}`}
            role="status"
            aria-live="polite"
          >
            {busy ? 'Saving…' : notice?.text}
          </div>
        </div>
        {camera && (
          <div
            className="camera-zoom-controls"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setZoomOpen(false);
            }}
          >
            {zoomOpen && (
              <div className="camera-zoom-panel" id="camera-zoom-panel">
                <input
                  aria-label="Camera zoom"
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step || 0.1}
                  value={zoom}
                  disabled={busy || zooming}
                  onChange={(event) => void changeZoom(Number(event.target.value))}
                />
              </div>
            )}
            <button
              className="zoom-toggle"
              aria-label="Adjust zoom"
              aria-expanded={zoomOpen}
              aria-controls="camera-zoom-panel"
              disabled={busy || zooming}
              onClick={() => setZoomOpen(!zoomOpen)}
            >
              {Number(zoom.toFixed(1))}×
            </button>
          </div>
        )}
      </div>
      <div className="capture-bottom">
        <div className="capture-controls">
          <div className="capture-thumbnail">
            {latest && (
              <>
                <Photo
                  id={latest}
                  alt="Review latest photo"
                  onClick={() => {
                    setZoomOpen(false);
                    setViewer(latest);
                  }}
                />
                <span
                  className="capture-count"
                  aria-label={`${photos.length} ${overview ? 'overview photos' : 'photos to label'}`}
                >
                  {photos.length}
                </span>
              </>
            )}
          </div>
          <button
            className={`shutter ${busy ? 'saving' : ''}`}
            aria-label={overview ? 'Take room photo' : 'Take item photo'}
            disabled={busy || opening || zooming}
            onClick={shoot}
          >
            <span />
          </button>
          <span aria-hidden="true" />
        </div>
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
