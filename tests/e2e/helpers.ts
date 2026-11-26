import { expect, type Page } from '@playwright/test';

// Offline readiness lives in Settings; inspect the worker without adding a badge to Home.
export async function waitForOffline(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const worker = (await navigator.serviceWorker.getRegistration())?.active;
          if (!worker) return false;
          return new Promise<boolean>((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => {
              channel.port1.close();
              resolve(false);
            }, 2000);
            channel.port1.onmessage = (event) => {
              clearTimeout(timer);
              channel.port1.close();
              resolve(event.data.ready === true);
            };
            worker.postMessage({ type: 'CHECK_READY', repair: false }, [channel.port2]);
          });
        }),
      { timeout: 90000 },
    )
    .toBe(true);
}
