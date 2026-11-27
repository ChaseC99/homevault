import {
  PDFDocument,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFPage,
} from 'pdf-lib';
import { getAsset } from './db';
import { imageBitmap } from './media';

export interface ReportMedia {
  width: number;
  height: number;
  draw: (page: PDFPage, x: number, y: number, width: number, height: number) => void;
}

// JPEG pixels stay byte-for-byte intact; EXIF rotation/reflection is applied
// to the PDF drawing matrix instead of decoding and recompressing the image.
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    for (let offset = 2; offset + 4 < bytes.length;) {
      const marker = view.getUint16(offset);
      if (marker === 0xffda || marker === 0xffd9) break;
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        const tiff = offset + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const directory = tiff + view.getUint32(tiff + 4, little);
        const count = view.getUint16(directory, little);
        for (let i = 0; i < count; i++) {
          const entry = directory + 2 + i * 12;
          if (view.getUint16(entry, little) === 0x0112) {
            const orientation = view.getUint16(entry + 8, little);
            return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
      }
      offset += length + 2;
    }
  } catch {
    // Malformed optional EXIF metadata must not prevent embedding valid pixels.
  }
  return 1;
}

function oriented(
  width: number,
  height: number,
  orientation: number,
  draw: ReportMedia['draw'],
): ReportMedia {
  const swapped = orientation >= 5;
  return {
    width: swapped ? height : width,
    height: swapped ? width : height,
    draw(page, x, y, w, h) {
      const matrices: Record<number, [number, number, number, number, number, number]> = {
        1: [1, 0, 0, 1, x, y],
        2: [-1, 0, 0, 1, x + w, y],
        3: [-1, 0, 0, -1, x + w, y + h],
        4: [1, 0, 0, -1, x, y + h],
        5: [0, -1, -1, 0, x + w, y + h],
        6: [0, -1, 1, 0, x, y + h],
        7: [0, 1, 1, 0, x, y],
        8: [0, 1, -1, 0, x + w, y],
      };
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrices[orientation]));
      draw(page, 0, 0, swapped ? h : w, swapped ? w : h);
      page.pushOperators(popGraphicsState());
    },
  };
}

export function reportMediaLoader(doc: PDFDocument) {
  const cache = new Map<string, Promise<ReportMedia[]>>();
  async function load(assetId: string): Promise<ReportMedia[]> {
    const asset = await getAsset(assetId);
    if (!asset)
      throw Error(
        'A photo or receipt is missing from device storage. Check the item before exporting.',
      );
    const bytes = new Uint8Array(await asset.original.arrayBuffer());
    if (asset.type === 'application/pdf') {
      try {
        const source = await PDFDocument.load(bytes);
        // Flatten form appearances before embedding so filled-in receipt values survive.
        const form = source.getForm();
        if (form.getFields().length) form.flatten({ updateFieldAppearances: false });
        const pages = source.getPages();
        for (const page of pages) {
          // A genuinely blank page still counts as a receipt page.
          if (!page.node.Contents()) page.pushOperators(pushGraphicsState(), popGraphicsState());
        }
        const embedded = await doc.embedPages(
          pages,
          pages.map((page) => {
            const { x, y, width, height } = page.getCropBox();
            return { left: x, bottom: y, right: x + width, top: y + height };
          }),
        );
        // Eagerly embed here so unsupported/encrypted receipts fail with a useful error.
        await Promise.all(embedded.map((page) => page.embed()));
        return embedded.map((image, index) => {
          const angle = ((pages[index].getRotation().angle % 360) + 360) % 360;
          const orientation = angle === 90 ? 6 : angle === 180 ? 3 : angle === 270 ? 8 : 1;
          return oriented(image.width, image.height, orientation, (page, x, y, width, height) => {
            page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
            page.drawPage(image, { x, y, width, height });
          });
        });
      } catch {
        throw Error(
          `Receipt “${asset.name}” could not be embedded (it may be encrypted or damaged). View the original, replace it, or turn off Receipts.`,
        );
      }
    }
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    let image;
    if (jpeg) image = await doc.embedJpg(bytes);
    else if (png) image = await doc.embedPng(bytes);
    else {
      // PDF supports JPEG/PNG directly. Other browser-decodable formats are
      // converted losslessly to PNG at their original dimensions, never JPEG.
      const bitmap = await imageBitmap(asset.original);
      const canvas = document.createElement('canvas');
      canvas.width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
      canvas.height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw Error('Could not prepare the original image for the report.');
        ctx.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(Error('Could not preserve the original image.')),
            'image/png',
          ),
        );
        image = await doc.embedPng(await blob.arrayBuffer());
      } finally {
        if ('close' in bitmap) bitmap.close();
        canvas.width = canvas.height = 0;
      }
    }
    const embedded = image;
    return [
      oriented(
        image.width,
        image.height,
        jpeg ? jpegOrientation(bytes) : 1,
        (page, x, y, width, height) => page.drawImage(embedded, { x, y, width, height }),
      ),
    ];
  }
  return (assetId: string) => {
    if (!cache.has(assetId)) cache.set(assetId, load(assetId));
    return cache.get(assetId)!;
  };
}
