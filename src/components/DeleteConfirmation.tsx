import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/db';
import { Button } from './shared';

export function DeleteConfirmation({
  kind,
  name,
  contents,
  onDelete,
  onDeleted,
  onCancel,
}: {
  kind: 'room' | 'property';
  name: string;
  contents: string;
  onDelete: () => Promise<unknown>;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="options-dialog delete-dialog"
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
      onCancel={(event) => {
        if (locked.current) event.preventDefault();
        else onCancel();
      }}
    >
      <div className="stack">
        <h2 id="delete-title">Delete {kind}?</h2>
        <p id="delete-description">
          This permanently deletes <strong>{name}</strong>
          {contents} from this device. This can’t be undone.
        </p>
        {error && (
          <p className="delete-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button ref={cancel} className="button secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <Button
            kind="destructive"
            disabled={busy}
            onClick={async () => {
              if (locked.current) return;
              locked.current = true;
              setBusy(true);
              setError('');
              try {
                await onDelete();
                onDeleted();
              } catch (error) {
                setError(errorMessage(error));
                locked.current = false;
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : `Delete ${kind}`}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
