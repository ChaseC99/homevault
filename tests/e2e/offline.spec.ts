import { test as base, expect, type Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { waitForOffline, failWrites, restoreWrites } from './helpers';

type UpdateServer = {
  url: string;
  version: number;
  gate: 'ready' | 'hold' | 'fail';
  release: () => void;
  holdCheck: boolean;
  releaseCheck: () => void;
};

// Serve two real releases without rebuilding or modifying the shared preview files.
const test = base.extend<{ updateServer: UpdateServer }>({
  updateServer: async ({}, use) => {
    const pending: ServerResponse[] = [];
    const pendingChecks: (() => void)[] = [];
    const state: UpdateServer = {
      url: '',
      version: 1,
      gate: 'ready',
      holdCheck: false,
      releaseCheck() {
        state.holdCheck = false;
        for (const resume of pendingChecks.splice(0)) resume();
      },
      release() {
        state.gate = 'ready';
        for (const response of pending.splice(0)) response.end('Downloaded');
      },
    };
    const root = path.resolve('dist');
    const basePath = process.env.BASE_PATH || '/';
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.webmanifest': 'application/manifest+json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.wasm': 'application/wasm',
    };
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url!, 'http://localhost').pathname;
      if (!pathname.startsWith(basePath)) {
        response.writeHead(404).end();
        return;
      }
      const relative = pathname.slice(basePath.length) || 'index.html';
      response.setHeader('Cache-Control', 'no-store');
      if (relative === 'update-gate') {
        if (state.gate === 'hold') pending.push(response);
        else if (state.gate === 'fail') response.writeHead(503).end('Download failed');
        else response.end('Downloaded');
        return;
      }
      try {
        if (relative === 'sw.js' && state.holdCheck)
          await new Promise<void>((resolve) => pendingChecks.push(resolve));
        let body: Buffer | string = await readFile(path.join(root, relative));
        if (relative === 'sw.js') {
          body = body
            .toString()
            .replace(
              /const VERSION = .+;/,
              `const VERSION = CACHE_PREFIX + 'test-release-${state.version}';`,
            );
          if (state.version > 1) body += "\nFILES.unshift(new URL('update-gate', BASE).href);\n";
        } else if (relative === 'index.html') {
          body = body
            .toString()
            .replace('</head>', `<meta name="test-release" content="${state.version}"></head>`);
        } else if (relative.startsWith('assets/') && relative.endsWith('.js')) {
          body = body
            .toString()
            .replace(/revision:"[^"]+"/, `revision:"test-release-${state.version}"`);
        }
        response.setHeader(
          'Content-Type',
          mime[path.extname(relative)] || 'application/octet-stream',
        );
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    state.url = `http://127.0.0.1:${(server.address() as { port: number }).port}${basePath}`;
    try {
      await use(state);
    } finally {
      state.releaseCheck();
      state.release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
});

const notice = (page: Page) => page.getByRole('region', { name: 'App update', exact: true });
const release = (page: Page) => page.locator('meta[name="test-release"]');
async function inventory(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('jigsaw-homevault');
      request.onsuccess = () => resolve(request.result);
    });
    const state = await new Promise<unknown>((resolve) => {
      const request = db.transaction('state').objectStore('state').get('inventory');
      request.onsuccess = () => resolve(request.result);
    });
    const assets = await new Promise<any[]>((resolve) => {
      const request = db.transaction('assets').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return {
      state,
      assets: await Promise.all(
        assets.map(async (asset) => ({
          id: asset.id,
          hash: [
            ...new Uint8Array(
              await crypto.subtle.digest('SHA-256', await asset.original.arrayBuffer()),
            ),
          ],
        })),
      ),
    };
  });
}

test('downloaded updates wait for Restart, preserve inventory offline, and do not reload an editing window', async ({
  page,
  context,
  updateServer,
}) => {
  await page.goto(updateServer.url);
  await waitForOffline(page);
  await expect(notice(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'New property', exact: true }).click();
  await page.getByLabel('Property name', { exact: true }).fill('Update test home');
  await page
    .getByLabel('Choose exterior photo')
    .setInputFiles(path.resolve('tests/fixtures/photo-1.jpg'));
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Update test home', exact: true })).toBeVisible();
  const before = await inventory(page);
  const propertyURL = page.url();
  const editing = await context.newPage();
  await editing.goto(`${updateServer.url}#/new`);
  await editing.getByLabel('Property name', { exact: true }).fill('Unsaved draft');
  await page.bringToFront();

  updateServer.version = 2;
  updateServer.gate = 'hold';
  // Returning to the installed app triggers an update check.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.installing),
    )
    .toBe(true);
  await expect(notice(page)).toHaveCount(0);
  await expect(release(page)).toHaveAttribute('content', '1');
  updateServer.release();
  await expect(notice(page)).toBeVisible({ timeout: 90000 });
  await expect(notice(editing)).toHaveCount(0);
  // A waiting update must also be discovered after a page reload.
  await page.reload();
  await expect(release(page)).toHaveAttribute('content', '1');
  await expect(notice(page)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  const box = (await notice(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(568);

  await context.setOffline(true);
  await notice(page).getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(release(page)).toHaveAttribute('content', '2');
  await expect(page).toHaveURL(propertyURL);
  await expect(page.getByRole('heading', { name: 'Update test home', exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  expect(await inventory(page)).toEqual(before);
  await expect(editing.getByLabel('Property name', { exact: true })).toHaveValue('Unsaved draft');
  await expect(release(editing)).toHaveAttribute('content', '1');
  await editing
    .getByRole('navigation', { name: 'Page navigation' })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(notice(editing)).toBeVisible();
  await notice(editing).getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(release(editing)).toHaveAttribute('content', '2');
  await expect(notice(editing)).toHaveCount(0);
});

test('failed downloads keep the current version and a later manual check can find an update', async ({
  page,
  updateServer,
}) => {
  await page.goto(`${updateServer.url}#/settings`);
  await waitForOffline(page);
  const updates = page.getByRole('region', { name: 'App updates', exact: true });
  updateServer.version = 2;
  updateServer.gate = 'fail';
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates.getByRole('alert')).toContainText('Check failed');
  await expect(updates.getByRole('alert')).toContainText('could not finish downloading');
  await expect(notice(page)).toHaveCount(0);
  await expect(release(page)).toHaveAttribute('content', '1');
  await waitForOffline(page);
  updateServer.version = 3;
  updateServer.gate = 'ready';
  await updates.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(updates.getByRole('status')).toHaveText('Update available', { timeout: 90000 });
  await updates.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(release(page)).toHaveAttribute('content', '3');
  await expect(notice(page)).toHaveCount(0);
});

test('Settings reports check and download states, saves organizer edits before restarting, and displays the running build', async ({
  page,
  context,
  updateServer,
}) => {
  await page.goto(`${updateServer.url}#/settings`);
  await waitForOffline(page);
  const updates = page.getByRole('region', { name: 'App updates', exact: true });
  const version = page.getByLabel('App version', { exact: true });
  await expect(version).toContainText('Version 0.1.0 · Build test-release-1');
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates.getByRole('status')).toHaveText('You’re up to date.');
  await context.setOffline(true);
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates.getByRole('alert')).toContainText('Check failed');
  await expect(updates.getByRole('alert')).toContainText('You’re offline');
  await context.setOffline(false);
  await updates.getByRole('button', { name: 'Retry' }).click();
  await expect(updates.getByRole('status')).toHaveText('You’re up to date.');

  updateServer.version = 2;
  updateServer.holdCheck = true;
  updateServer.gate = 'hold';
  await updates.getByRole('button', { name: 'Check for updates' }).click();
  await expect(updates.getByRole('status')).toHaveText('Checking for updates…');
  await expect(updates.getByRole('button')).toBeDisabled();
  updateServer.releaseCheck();
  await expect(updates.getByRole('status')).toHaveText('Downloading update…');
  await expect(updates.getByRole('button')).toBeDisabled();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await expect(version).toContainText('Build test-release-1');
  updateServer.release();
  await expect(updates.getByRole('status')).toHaveText('Update available', { timeout: 90000 });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/settings-update-ready.png' });

  await page.getByLabel('Organizer name', { exact: true }).fill('Saved before restart');
  await failWrites(page);
  await updates.getByRole('button', { name: 'Restart' }).click();
  await expect(updates.getByRole('alert')).toContainText('Restart failed');
  await expect(updates.getByRole('alert')).toContainText('Storage is full');
  await expect(page.getByLabel('Organizer name', { exact: true })).toHaveValue(
    'Saved before restart',
  );
  await expect(version).toContainText('Build test-release-1');
  await restoreWrites(page);
  await context.setOffline(true);
  await updates.getByRole('button', { name: 'Restart' }).click();
  await expect(release(page)).toHaveAttribute('content', '2');
  await expect(version).toContainText('Build test-release-2');
  await expect(page.getByLabel('Organizer name', { exact: true })).toHaveValue(
    'Saved before restart',
  );
  await expect(updates.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
});

test('installation respects the deployment path and repairs missing offline assets', async ({
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
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      await (await caches.open(name)).delete(new URL('ocr/eng.traineddata.gz', location.href).href);
  });
  await page.getByRole('button', { name: 'Check offline readiness', exact: true }).click();
  await expect(page.getByText('Offline setup needed', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await waitForOffline(page);
});
