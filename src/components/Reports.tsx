import { useEffect, useState } from 'react';
import { type Inventory, stats, money } from '../lib/model';
import { generateReport, type ReportOptions } from '../lib/report';
import { downloadBlob } from '../lib/media';
import { Button, Field, FileText, Empty, go } from './shared';
import type { Run } from './Setup';
export function Reports({
  data,
  initialProperty,
  run,
}: {
  data: Inventory;
  initialProperty?: string;
  run: Run;
}) {
  const [pid, setPid] = useState(initialProperty ?? data.properties[0]?.id ?? ''),
    [options, setOptions] = useState<ReportOptions>({
      cover: true,
      roomPhotos: true,
      itemPhotos: true,
      receipts: true,
    }),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [result, setResult] = useState<{ blob: Blob; url: string; name: string }>();
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  const property = data.properties.find((p) => p.id === pid),
    s = stats(data, pid);
  if (!property)
    return (
      <Empty
        icon={<FileText size={34} />}
        title="Your work, ready to share."
        action={<Button onClick={() => go('/new')}>Create a property</Button>}
      >
        Create your first property to build an inventory report.
      </Empty>
    );
  return (
    <>
      <header>
        <span className="eyebrow">THE FINISHED PICTURE</span>
        <h1>Insurance report</h1>
        <p>A clear record of what’s in the home, prepared for your client and their agent.</p>
      </header>
      <Field label="Property">
        <select
          value={pid}
          disabled={busy}
          onChange={(e) => {
            setPid(e.target.value);
            setResult(undefined);
          }}
        >
          {data.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {s.unsorted > 0 && (
        <div className="notice warn">
          <div>
            <strong>{s.unsorted} photos still need labeling.</strong>
            <p>They’ll be labeled unassigned and excluded from item counts and totals.</p>
          </div>
          <Button kind="text" onClick={() => go(`/property/${pid}`)}>
            Label photos
          </Button>
        </div>
      )}
      {s.needs > 0 && (
        <div className="notice warn">
          <div>
            <strong>{s.needs} items need details.</strong>
            <p>They’ll appear with their photos and any real information recorded so far.</p>
          </div>
          <Button
            kind="text"
            onClick={() => go(`/details/${s.items.find((i) => !i.reviewed)!.id}?session`)}
          >
            Finish
          </Button>
        </div>
      )}
      <section className="card form-card">
        <h2>Include in the report</h2>
        {(Object.keys(options) as (keyof ReportOptions)[]).map((key) => (
          <label className="check-row" key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              disabled={busy}
              onChange={(e) => {
                setOptions({ ...options, [key]: e.target.checked });
                setResult(undefined);
              }}
            />
            <span>
              <strong>
                {
                  {
                    cover: 'Cover page',
                    roomPhotos: 'Room overview photos',
                    itemPhotos: 'Item & unassigned photos',
                    receipts: 'Receipts',
                  }[key]
                }
              </strong>
              <small>
                {
                  {
                    cover: 'Exterior photo, homeowner, property address and organizer',
                    roomPhotos: 'The wider view of every room',
                    itemPhotos: 'Every photo, including partial records',
                    receipts: `${s.items.reduce((count, item) => count + item.receipts.length, 0)} receipts, shown with each item`,
                  }[key]
                }
              </small>
            </span>
          </label>
        ))}
      </section>
      <div className="report-total">
        <FileText size={32} />
        <div>
          <strong>
            {s.items.length} item records · {money(s.total)}
          </strong>
          <small>{s.unknown} items without recorded prices</small>
        </div>
      </div>
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            setBusy(true);
            setResult(undefined);
            try {
              const blob = await generateReport(data, property, options, setProgress);
              const name = `${property.name.replace(/[^a-z0-9 -]/gi, '').trim() || 'Property'}-inventory.pdf`;
              setResult({ blob, url: URL.createObjectURL(blob), name });
            } finally {
              setBusy(false);
              setProgress('');
            }
          })
        }
      >
        {busy ? progress || 'Generating…' : 'Generate PDF'}
      </Button>
      <p className="center subtle">Made on this device. No internet needed after setup.</p>
      {result && (
        <section className="card form-card report-result">
          <h2>Your PDF is ready.</h2>
          <p>
            {(result.blob.size / 1024 / 1024).toFixed(1)} MB · Generated from the current inventory
          </p>
          <a className="button secondary" href={result.url} target="_blank" rel="noreferrer">
            Open PDF / print
          </a>
          <Button onClick={() => downloadBlob(result.blob, result.name)}>Download PDF</Button>
          <Button
            kind="secondary"
            onClick={() =>
              run(async () => {
                const file = new File([result.blob], result.name, { type: 'application/pdf' });
                if (navigator.canShare?.({ files: [file] })) {
                  try {
                    await navigator.share({ files: [file], title: property.name + ' inventory' });
                  } catch (e) {
                    if (e instanceof DOMException && e.name === 'AbortError') return;
                    throw e;
                  }
                } else downloadBlob(result.blob, result.name);
              })
            }
          >
            Share PDF
          </Button>
        </section>
      )}
      <p className="subtle center">
        Share through your device’s share sheet, save to Files, or open the PDF to print. Email is
        available when connected.
      </p>
    </>
  );
}
