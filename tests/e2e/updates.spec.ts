import { test as base, expect, type Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { waitForOffline } from './helpers';

type UpdateServer = {
  url: string;
  version: number;
  gate: 'ready' | 'hold' | 'fail';
  release: () => void;
};

// Serve two real releases without rebuilding or modifying the shared preview files.
const test = base.extend<{ updateServer: UpdateServer }>({
  updateServer: async ({}, use) => {
    const pending: ServerResponse[] = [];
    const state: UpdateServer = {
      url: '',
      version: 1,
      gate: 'ready',
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
      state.release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
});

const notice = (page: Page) => page.getByRole('region', { name: 'App update' });
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
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/update-notice-320.png' });

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
  await page.goto(updateServer.url);
  await waitForOffline(page);
  updateServer.version = 2;
  updateServer.gate = 'fail';
  await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    await registration.update();
    const worker = registration.installing;
    if (worker && worker.state !== 'redundant')
      await new Promise<void>((resolve) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') resolve();
        });
      });
  });
  await expect(notice(page)).toHaveCount(0);
  await expect(release(page)).toHaveAttribute('content', '1');
  await waitForOffline(page);
  updateServer.version = 3;
  updateServer.gate = 'ready';
  await page.getByRole('button', { name: 'Organizer and device settings' }).click();
  await page.getByRole('button', { name: 'Check offline readiness' }).click();
  await expect
    .poll(
      () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(notice(page)).toBeVisible();
  await notice(page).getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(release(page)).toHaveAttribute('content', '3');
  await expect(notice(page)).toHaveCount(0);
});
