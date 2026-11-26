import { id, type Asset } from './model';
export async function imageBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(Error('This image cannot be decoded here. Try a JPEG or PNG export.'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
export async function imageBlob(
  blob: Blob,
  maxSize = 1600,
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await imageBitmap(blob);
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width,
    height = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image) image.close();
  const resized = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Could not process image.'))),
      'image/jpeg',
      0.9,
    ),
  );
  return { blob: resized, width, height };
}
export async function prepareAsset(file: Blob, name = 'Camera photo'): Promise<Asset> {
  const type = file.type || (/\.pdf$/i.test(name) ? 'application/pdf' : '');
  if (type === 'application/pdf')
    return {
      id: id(),
      original: file,
      thumbnail: null,
      width: 0,
      height: 0,
      name,
      type,
      capturedAt: new Date().toISOString(),
    };
  if (!type.startsWith('image/')) throw Error('Choose an image or PDF.');
  const thumb = await imageBlob(file, 400);
  return {
    id: id(),
    original: file,
    thumbnail: thumb.blob,
    width: thumb.width,
    height: thumb.height,
    name,
    type,
    capturedAt: new Date().toISOString(),
  };
}
export const downloadBlob = (blob: Blob, name: string) => {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
};
