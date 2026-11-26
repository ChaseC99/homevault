import { test, expect } from '@playwright/test';
import { waitForOffline } from './helpers';

test('installation assets and offline navigation stay inside the deployment path', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const outsideApp: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(baseURL!)) outsideApp.push(r.url());
  });
  page.on('response', (r) => {
    if (!r.ok()) failed.push(`${r.status()} ${r.url()}`);
  });
  // Seed a previous version and a neighboring app before this worker installs.
  const cachePrefix = `homevault:${new URL(baseURL!).pathname}:`;
  const oldCache = `${cachePrefix}previous-version`;
  const otherCache = 'homevault:/another-app/:keep';
  await page.goto('manifest.webmanifest');
  await page.evaluate(
    async ({ oldCache, otherCache }) => {
      await caches.open(oldCache);
      const other = await caches.open(otherCache);
      await other.put('/another-app/index.html', new Response('Other app'));
    },
    { oldCache, otherCache },
  );
  await page.goto('./');
  await waitForOffline(page);

  const manifestURL = await page
    .locator('link[rel="manifest"]')
    .evaluate((link) => (link as HTMLLinkElement).href);
  expect(manifestURL).toBe(new URL('manifest.webmanifest', baseURL).href);
  const response = await request.get(manifestURL);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  const startURL = new URL(manifest.start_url, manifestURL).href;
  expect(startURL).toBe(baseURL);
  expect(new URL(manifest.scope, manifestURL).href).toBe(baseURL);
  // Omitting id lets the browser use start_url as the app's stable identity.
  expect(manifest.id).toBeUndefined();
  for (const icon of manifest.icons) {
    const iconURL = new URL(icon.src, manifestURL).href;
    expect(iconURL.startsWith(baseURL!)).toBe(true);
    const image = await request.get(iconURL);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
  }
  for (const rel of ['icon', 'apple-touch-icon']) {
    const href = await page
      .locator(`link[rel="${rel}"]`)
      .evaluate((link) => (link as HTMLLinkElement).href);
    expect(href).toBe(new URL('icon-192.png', baseURL).href);
  }

  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration(location.href);
    return { scope: registration?.scope, script: registration?.active?.scriptURL };
  });
  expect(worker).toEqual({ scope: baseURL, script: new URL('sw.js', baseURL).href });
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).not.toContain(oldCache);
  expect(cacheNames).toContain(otherCache);
  const cachedURLs = await page.evaluate(async (prefix) => {
    const urls: string[] = [];
    for (const name of (await caches.keys()).filter((name) => name.startsWith(prefix)))
      for (const entry of await (await caches.open(name)).keys()) urls.push(entry.url);
    return urls;
  }, cachePrefix);
  expect(cachedURLs).toContain(new URL('ocr/eng.traineddata.gz', baseURL).href);
  expect(cachedURLs.every((url) => url.startsWith(baseURL!))).toBe(true);

  await context.setOffline(true);
  await page.goto(`${startURL}#/settings`);
  await expect(page.getByLabel('Organizer name', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  expect(outsideApp).toEqual([]);
  expect(failed).toEqual([]);
});
