import { cp, mkdir, readdir } from 'node:fs/promises';
import './report-fonts.mjs';
await mkdir('public/ocr', { recursive: true });
await cp('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
for (const f of await readdir('node_modules/tesseract.js-core'))
  if (/\.wasm(?:\.js)?$/.test(f))
    await cp('node_modules/tesseract.js-core/' + f, 'public/ocr/' + f);
await cp(
  'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',
  'public/ocr/eng.traineddata.gz',
);
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs');
for (const [source, target] of [
  ['cmaps', 'pdf-cmaps'],
  ['standard_fonts', 'pdf-fonts'],
  ['wasm', 'pdf-wasm'],
])
  await cp('node_modules/pdfjs-dist/' + source, 'public/' + target, { recursive: true });
await mkdir('public/fonts', { recursive: true });
await cp(
  'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
  'public/fonts/report-regular.woff',
);
await cp(
  'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff',
  'public/fonts/report-semibold.woff',
);
console.log('Offline OCR, PDF worker and fonts copied.');
await cp(
  'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt',
  'public/ocr/worker.min.js.LICENSE.txt',
);
