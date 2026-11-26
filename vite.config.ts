import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let revision = process.env.GITHUB_SHA?.slice(0, 7) || 'local';
if (!process.env.GITHUB_SHA) {
  try {
    revision = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
      revision += '-modified';
  } catch {
    // Source archives without Git still show the release version.
  }
}

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify({ version, revision, builtAt: new Date().toISOString() }),
  },
  build: { target: 'es2022' },
  server: { port: 5173 },
});
