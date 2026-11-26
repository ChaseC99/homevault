import { assetUrl } from './asset-url';

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
  const scope = new URL(import.meta.env.BASE_URL, location.href).href;
  let registration = await navigator.serviceWorker.getRegistration(scope);
  // An unrelated worker at the origin root must not stand in for this app's worker.
  if (registration?.scope !== scope)
    registration = await navigator.serviceWorker.register(assetUrl('sw.js'), { scope });
  else if (navigator.onLine) registration.update().catch(() => {});
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
