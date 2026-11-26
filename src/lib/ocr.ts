import { createWorker } from 'tesseract.js';
import { parseReceipt } from './receipt-parser';
import { getAsset, mutate, loadInventory } from './db';
import { renderPdfPages } from './pdf-input';
import { assetUrl } from './asset-url';
export async function readReceipt(
  itemId: string,
  receiptId: string,
  progress: (message: string) => void,
) {
  const receipt = (await loadInventory()).items
    .find((i) => i.id === itemId)
    ?.receipts.find((r) => r.id === receiptId);
  if (!receipt) return;
  const asset = await getAsset(receipt.assetId);
  if (!asset) throw Error('Receipt file is missing.');
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker('eng', 1, {
      workerPath: assetUrl('ocr/worker.min.js'),
      corePath: assetUrl('ocr'),
      langPath: assetUrl('ocr'),
      gzip: true,
      cacheMethod: 'none',
      logger: (m) =>
        progress(
          m.status === 'recognizing text'
            ? `Reading receipt · ${Math.round(m.progress * 100)}%`
            : 'Preparing on-device reader…',
        ),
    });
    let text = '';
    if (asset.type === 'application/pdf') {
      for await (const page of renderPdfPages(asset.original)) {
        progress(`Reading PDF page ${page.number} of ${page.total}…`);
        const out = await worker.recognize(page.canvas);
        text += out.data.text + '\n';
        page.canvas.width = page.canvas.height = 0;
      }
    } else {
      text = (await worker.recognize(asset.original)).data.text;
    }
    const fields = parseReceipt(text);
    const count = Object.values(fields).filter((v) => v !== undefined).length;
    await mutate((d) => {
      const i = d.items.find((i) => i.id === itemId);
      const r = i?.receipts.find((r) => r.id === receiptId);
      if (r) {
        Object.assign(r, fields, {
          text,
          status: count === 3 ? 'read' : count ? 'partial' : 'failed',
          error: count ? '' : 'No usable fields found. Enter details manually.',
        });
      }
    });
    return fields;
  } catch (e) {
    await mutate((d) => {
      const r = d.items.find((i) => i.id === itemId)?.receipts.find((r) => r.id === receiptId);
      if (r) {
        r.status = 'failed';
        r.error = 'Could not read this receipt. The original is saved; enter details or retry.';
      }
    });
    throw e;
  } finally {
    await worker?.terminate();
  }
}
