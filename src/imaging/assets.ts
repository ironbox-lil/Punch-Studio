import { cropRect, panelSize } from '../domain/ratios';
import type { Rect, Size } from '../domain/types';

export interface ImageAsset extends Size {
  bitmap: ImageBitmap;
  thumbnail: string;
  name: string;
  id: string;
}

export function canvas(size: Size): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = size.width;
  element.height = size.height;
  return element;
}

export function context(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建画布，请尝试更新浏览器。');
  return ctx;
}

export async function loadAsset(blob: Blob, name: string): Promise<ImageAsset> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))
    throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (blob.size > 30 * 1024 * 1024) throw new Error('图片不能超过 30 MB。');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('图片无法读取，请确认文件没有损坏。');
  }
  if (bitmap.width * bitmap.height > 50_000_000) {
    bitmap.close();
    throw new Error('图片超过 5000 万像素，请先缩小后上传。');
  }
  const small = canvas(panelSize(bitmap.width / bitmap.height, 160));
  context(small).drawImage(bitmap, 0, 0, small.width, small.height);
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    name,
    thumbnail: small.toDataURL('image/jpeg', 0.8),
    id: crypto.randomUUID(),
  };
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  asset: ImageAsset,
  target: Size,
  source?: Rect,
) {
  const crop = source ?? cropRect(asset, target.width / target.height);
  ctx.drawImage(
    asset.bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    target.width,
    target.height,
  );
}

export function imagePreview(asset: ImageAsset, ratio: number, source?: Rect): string {
  const preview = canvas(panelSize(ratio, 768));
  const ctx = context(preview);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, preview.width, preview.height);
  drawCover(ctx, asset, preview, source);
  return preview.toDataURL('image/jpeg', 0.82);
}

export function dominantColor(asset: ImageAsset): string {
  const sample = canvas({ width: 64, height: 64 });
  const ctx = context(sample);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.drawImage(asset.bitmap, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  // Quantized histogram avoids turning multicolored paper into a muddy average.
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!,
      g = data[i + 1]!,
      b = data[i + 2]!;
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const top = [...bins.values()].sort((a, b) => b.count - a.count)[0]!;
  return (
    '#' +
    [top.r, top.g, top.b]
      .map((v) =>
        Math.round(v / top.count)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}
