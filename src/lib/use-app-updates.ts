import { useEffect, useRef, useState } from 'react';
import { activateUpdate, checkForUpdates, watchForUpdates } from './offline';
import { errorMessage } from './db';
import { canNavigate } from './navigation';

type Status = 'idle' | 'checking' | 'downloading' | 'current' | 'ready' | 'restarting' | 'error';
export type AppUpdates = ReturnType<typeof useAppUpdates>;

export function useAppUpdates() {
  const [update, setUpdate] = useState<ServiceWorker>();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const pending = useRef<ServiceWorker | undefined>(undefined);
  const locked = useRef(false);
  useEffect(
    () =>
      watchForUpdates((worker) => {
        pending.current = worker;
        setUpdate(worker);
        setError('');
        setStatus((current) => (current === 'restarting' ? current : worker ? 'ready' : 'idle'));
      }),
    [],
  );

  async function check() {
    if (locked.current) return;
    locked.current = true;
    setStatus('checking');
    setError('');
    try {
      const worker = await checkForUpdates(() => setStatus('downloading'));
      const next = worker ?? pending.current;
      pending.current = next;
      setUpdate(next);
      setStatus(next ? 'ready' : 'current');
    } catch (error) {
      setError(errorMessage(error));
      setStatus('error');
    } finally {
      locked.current = false;
    }
  }

  async function restart(beforeRestart?: () => Promise<void>) {
    if (!pending.current || locked.current) return;
    locked.current = true;
    setStatus('restarting');
    setError('');
    try {
      if (!(await canNavigate())) throw Error('Save your changes before restarting.');
      await beforeRestart?.();
      await activateUpdate(pending.current);
      window.location.reload();
    } catch (error) {
      setError(errorMessage(error));
      setStatus('error');
      locked.current = false;
    }
  }
  return { update, status, error, check, restart };
}
