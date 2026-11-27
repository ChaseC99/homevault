// PDF font streams need sfnt/TrueType bytes, not a WOFF container. Keep the
// installed Space Grotesk outlines intact and unpack only the WOFF compression.
import { readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const woff = await readFile(
  'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff',
);
const count = woff.readUInt16BE(12);
const ttf = Buffer.alloc(woff.readUInt32BE(16));
ttf.writeUInt32BE(woff.readUInt32BE(4), 0);
ttf.writeUInt16BE(count, 4);
const power = Math.floor(Math.log2(count));
ttf.writeUInt16BE(2 ** power * 16, 6);
ttf.writeUInt16BE(power, 8);
ttf.writeUInt16BE(count * 16 - 2 ** power * 16, 10);
let offset = 12 + count * 16;
let head = 0;
for (let i = 0; i < count; i++) {
  const entry = 44 + i * 20;
  const start = woff.readUInt32BE(entry + 4);
  const compressed = woff.readUInt32BE(entry + 8);
  const length = woff.readUInt32BE(entry + 12);
  const data = woff.subarray(start, start + compressed);
  woff.copy(ttf, 12 + i * 16, entry, entry + 4);
  ttf.writeUInt32BE(woff.readUInt32BE(entry + 16), 16 + i * 16);
  ttf.writeUInt32BE(offset, 20 + i * 16);
  ttf.writeUInt32BE(length, 24 + i * 16);
  (compressed < length ? inflateSync(data) : data).copy(ttf, offset);
  if (woff.toString('ascii', entry, entry + 4) === 'head') head = offset;
  offset += (length + 3) & ~3;
}
ttf.writeUInt32BE(0, head + 8);
let checksum = 0;
for (let i = 0; i < ttf.length; i += 4) checksum = (checksum + ttf.readUInt32BE(i)) >>> 0;
ttf.writeUInt32BE((0xb1b0afba - checksum) >>> 0, head + 8);
await writeFile('public/fonts/report-heading.ttf', ttf);
