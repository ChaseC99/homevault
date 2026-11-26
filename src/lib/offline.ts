import { assetUrl } from './asset-url';

async function appRegistration() {
  const scope = new URL(import.meta.env.BASE_URL, location.href).href;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  // An unrelated worker at the origin root must not stand in for this app's worker.
  return registration?.scope === scope
    ? registration
    : navigator.serviceWorker.register(assetUrl('sw.js'), { scope });
}

// Keep watching while the notice is hidden during capture or editing.
export function watchForUpdates(onUpdate: (worker: ServiceWorker | undefined) => void) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return () => {};
  let disposed = false;
  let cleanup = () => {};
  void appRegistration()
    .then((registration) => {
      if (disposed) return;
      const workers = new Set<ServiceWorker>();
      let offered: ServiceWorker | undefined;
      let controller = navigator.serviceWorker.controller;
      const offer = (worker: ServiceWorker) => {
        offered = worker;
        onUpdate(worker);
      };
      const inspect = () => {
        if (registration.active && registration.waiting) offer(registration.waiting);
        else if (offered?.state === 'redundant') {
          offered = undefined;
          onUpdate(undefined);
        }
      };
      const installing = () => {
        const worker = registration.installing;
        if (worker && !workers.has(worker)) {
          workers.add(worker);
          worker.addEventListener('statechange', inspect);
        }
        inspect();
      };
      const changed = () => {
        const next = navigator.serviceWorker.controller;
        // Another window may activate an update. Offer a restart, never reload its peers.
        if (controller && next && next !== controller) offer(next);
        controller = next;
      };
      const resumed = () => {
        if (document.visibilityState === 'visible' && navigator.onLine)
          void registration.update().catch(() => {});
      };
      registration.addEventListener('updatefound', installing);
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      document.addEventListener('visibilitychange', resumed);
      installing();
      cleanup = () => {
        registration.removeEventListener('updatefound', installing);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        document.removeEventListener('visibilitychange', resumed);
        for (const worker of workers) worker.removeEventListener('statechange', inspect);
      };
    })
    .catch(() => {}); // Offline setup reports registration errors separately.
  return () => {
    disposed = true;
    cleanup();
  };
}

export function activateUpdate(worker: ServiceWorker): Promise<void> {
  if (navigator.serviceWorker.controller === worker && worker.state === 'activated')
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      worker.removeEventListener('statechange', changed);
    };
    const changed = () => {
      if (navigator.serviceWorker.controller === worker && worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(Error('This update is no longer available. Check for updates again.'));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error('Could not restart yet. Please try again.'));
    }, 15000);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    worker.addEventListener('statechange', changed);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
      changed();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function checkForUpdates(downloading: () => void): Promise<ServiceWorker | undefined> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD)
    throw Error('Update checks are available in the published app.');
  const registration = await appRegistration();
  if (registration.waiting) return registration.waiting;
  if (!navigator.onLine) throw Error('You’re offline. Connect to the internet and try again.');
  const previous = registration.active;
  return new Promise((resolve, reject) => {
    let candidate: ServiceWorker | null = null;
    let checked = false;
    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      registration.removeEventListener('updatefound', found);
      candidate?.removeEventListener('statechange', inspect);
    };
    const finish = (worker?: ServiceWorker, error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve(worker);
    };
    const inspect = () => {
      if (registration.waiting) return finish(registration.waiting);
      if (candidate?.state === 'installed' && previous) return finish(candidate);
      if (candidate?.state === 'redundant')
        return finish(
          undefined,
          Error('The update could not finish downloading. Please try again.'),
        );
      if (candidate?.state === 'activated') return finish(previous ? candidate : undefined);
      if (checked && !candidate) return finish();
    };
    const found = () => {
      const worker = registration.installing;
      if (worker && worker !== candidate) {
        candidate?.removeEventListener('statechange', inspect);
        candidate = worker;
        candidate.addEventListener('statechange', inspect);
        downloading();
      }
      inspect();
    };
    const timer = setTimeout(() => {
      finish(undefined, Error('The update check timed out. Check your connection and try again.'));
    }, 120000);
    registration.addEventListener('updatefound', found);
    if (registration.installing) {
      checked = true;
      found();
    } else {
      void registration
        .update()
        .then(() => {
          if (finished) return;
          checked = true;
          found();
        })
        .catch(() => {
          finish(
            undefined,
            Error('Could not check for updates. Check your connection and try again.'),
          );
        });
    }
  });
}

function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (registration.active) return Promise.resolve(registration.active);
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return Promise.reject(Error('Offline setup could not start. Try again.'));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', checkState);
    };
    const checkState = () => {
      if (worker.state === 'activated') {
        cleanup();
        resolve(worker);
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(
          Error('Offline setup could not finish downloading. Check your connection and retry.'),
        );
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error('Offline setup is still downloading. Keep this page open, then check again.'));
    }, 90000);
    worker.addEventListener('statechange', checkState);
    checkState();
  });
}

export async function checkOffline(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return false;
  const registration = await appRegistration();
  if (registration.active && navigator.onLine) registration.update().catch(() => {});
  const worker = await activeWorker(registration);
  return new Promise<boolean>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(Error('Offline check timed out. Try again.'));
    }, 30000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(e.data.ready === true);
    };
    worker.postMessage({ type: 'CHECK_READY', repair: navigator.onLine }, [channel.port2]);
  });
}
