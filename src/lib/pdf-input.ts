import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { assetUrl } from './asset-url';
GlobalWorkerOptions.workerSrc = assetUrl('pdf.worker.min.mjs');
export async function* renderPdfPages(blob: Blob) {
  const task = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    cMapUrl: assetUrl('pdf-cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('pdf-fonts/'),
    wasmUrl: assetUrl('pdf-wasm/'),
  });
  const doc = await task.promise;
  try {
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const view = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 2200 / Math.max(view.width, view.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      yield { canvas, number, total: doc.numPages };
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}
