import { useEffect, useRef, useState } from 'react';
import { activateUpdate, watchForUpdates } from '../lib/offline';
import { errorMessage } from '../lib/db';
import { Button } from './shared';

export function UpdateNotice({ visible }: { visible: boolean }) {
  const [update, setUpdate] = useState<ServiceWorker>();
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  useEffect(() => watchForUpdates(setUpdate), []);
  if (!visible || !update) return null;
  async function restart() {
    if (!update || locked.current) return;
    locked.current = true;
    setRestarting(true);
    setError('');
    try {
      await activateUpdate(update);
      window.location.reload();
    } catch (error) {
      setError(errorMessage(error));
      locked.current = false;
      setRestarting(false);
    }
  }
  return (
    <section className="update-notice" aria-label="App update">
      <div className="row">
        <strong role="status">Update available</strong>
        <Button disabled={restarting} onClick={() => void restart()}>
          {restarting ? 'Restarting…' : 'Restart'}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
