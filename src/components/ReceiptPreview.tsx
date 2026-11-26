import { useEffect, useRef, useState } from 'react';
import { getAsset, errorMessage } from '../lib/db';
import { renderPdfPages } from '../lib/pdf-input';
import { downloadBlob } from '../lib/media';
import { Button, X } from './shared';

export function ReceiptPreview({ assetId, label }: { assetId: string; label: string }) {
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(1);
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true,
      objectUrl = '';
    setUrl('');
    setError('');
    (async () => {
      const asset = await getAsset(assetId);
      if (!asset) throw Error('Receipt file is missing.');
      let blob = asset.original;
      if (asset.type === 'application/pdf') {
        for await (const rendered of renderPdfPages(blob, page)) {
          if (!active) break;
          setTotal(rendered.total);
          blob = await new Promise<Blob>((resolve, reject) =>
            rendered.canvas.toBlob(
              (b) => (b ? resolve(b) : reject(Error('Could not preview receipt.'))),
              'image/png',
            ),
          );
          rendered.canvas.width = rendered.canvas.height = 0;
        }
      } else setTotal(1);
      if (active) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    })().catch((e) => {
      if (active) setError(errorMessage(e));
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, page]);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);
  const preview = url ? (
    <img src={url} alt={`${label}, page ${page}`} />
  ) : (
    <p role="status">{error || 'Loading receipt…'}</p>
  );
  return (
    <div className="receipt-preview">
      <strong>{label}</strong>
      <button
        className="receipt-thumbnail"
        aria-label={`View ${label.toLowerCase()}`}
        onClick={() => setExpanded(true)}
      >
        {preview}
      </button>
      {total > 1 && <small>{total} pages · tap to read</small>}
      <dialog
        ref={dialog}
        className="receipt-dialog"
        aria-label={label}
        onCancel={() => setExpanded(false)}
      >
        <div className="modal-head">
          <strong>{label}</strong>
          <Button kind="secondary" onClick={() => setExpanded(false)}>
            <X size={18} /> Close
          </Button>
        </div>
        <div className="receipt-page">{preview}</div>
        {total > 1 && (
          <div className="row receipt-pagination">
            <Button kind="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous page
            </Button>
            <span>
              {page} / {total}
            </span>
            <Button kind="secondary" disabled={page === total} onClick={() => setPage(page + 1)}>
              Next page
            </Button>
          </div>
        )}
        <Button
          kind="text"
          onClick={async () => {
            try {
              const asset = await getAsset(assetId);
              if (asset) downloadBlob(asset.original, asset.name);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Download original
        </Button>
      </dialog>
    </div>
  );
}
