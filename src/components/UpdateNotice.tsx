import type { AppUpdates } from '../lib/use-app-updates';
import { Button } from './shared';

export function UpdateNotice({ visible, updates }: { visible: boolean; updates: AppUpdates }) {
  if (!visible || !updates.update) return null;
  const restarting = updates.status === 'restarting';
  return (
    <section className="update-notice" aria-label="App update">
      <div className="row">
        <strong role="status">Update available</strong>
        <Button disabled={restarting} onClick={() => void updates.restart()}>
          {restarting ? 'Restarting…' : 'Restart'}
        </Button>
      </div>
      {updates.error && <p role="alert">{updates.error}</p>}
    </section>
  );
}

export function UpdateSettings({
  updates,
  beforeRestart,
}: {
  updates: AppUpdates;
  beforeRestart: () => Promise<void>;
}) {
  const busy = ['checking', 'downloading', 'restarting'].includes(updates.status);
  const labels = {
    idle: 'Check for the latest version.',
    checking: 'Checking for updates…',
    downloading: 'Downloading update…',
    current: 'You’re up to date.',
    ready: 'Update available',
    restarting: 'Restarting…',
    error: updates.update ? 'Restart failed' : 'Check failed',
  };
  return (
    <section className="card form-card" aria-label="App updates">
      <h2>App updates</h2>
      <div role={updates.status === 'error' ? 'alert' : 'status'}>
        <p>{labels[updates.status]}</p>
        {updates.error && <p>{updates.error}</p>}
      </div>
      <Button
        disabled={busy || !import.meta.env.PROD}
        onClick={() =>
          updates.update ? void updates.restart(beforeRestart) : void updates.check()
        }
      >
        {busy
          ? labels[updates.status]
          : updates.update
            ? 'Restart'
            : updates.status === 'error'
              ? 'Retry'
              : 'Check for updates'}
      </Button>
      {updates.update && <small>Your organizer details will be saved before restarting.</small>}
      {!import.meta.env.PROD && <small>Update checks are available in the published app.</small>}
    </section>
  );
}
