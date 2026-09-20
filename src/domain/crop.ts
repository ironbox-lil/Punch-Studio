import { cropRect, resolveRatio } from './ratios';
import type { EditorSettings, PhotoCrop, Point, Rect, Size } from './types';

export const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type CropHandle = (typeof CROP_HANDLES)[number];
const MIN_SIDE = 0.025;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function boundCrop(crop: PhotoCrop): PhotoCrop {
  const width = clamp(crop.width, 1e-6, 1);
  const height = clamp(crop.height, 1e-6, 1);
  return { x: clamp(crop.x, 0, 1 - width), y: clamp(crop.y, 0, 1 - height), width, height };
}

export function normalizeCrop(rect: Rect, image: Size): PhotoCrop {
  return {
    x: rect.x / image.width,
    y: rect.y / image.height,
    width: rect.width / image.width,
    height: rect.height / image.height,
  };
}

/** The one source rectangle used by the editor, AI preview and full-resolution renderer. */
export function photoCrop(image: Size, settings: Pick<EditorSettings, 'crop' | 'ratio'>): Rect {
  const normalized = settings.crop ? boundCrop(settings.crop) : { x: 0, y: 0, width: 1, height: 1 };
  const region = {
    x: normalized.x * image.width,
    y: normalized.y * image.height,
    width: normalized.width * image.width,
    height: normalized.height * image.height,
  };
  if (settings.ratio === 'free') return region;
  const fitted = cropRect(region, resolveRatio(image, settings.ratio).value);
  return { ...fitted, x: region.x + fitted.x, y: region.y + fitted.y };
}

export function fitCrop(crop: PhotoCrop, image: Size, ratio: number): PhotoCrop {
  const frame = cropRect(
    { width: crop.width * image.width, height: crop.height * image.height },
    ratio,
  );
  return {
    x: crop.x + frame.x / image.width,
    y: crop.y + frame.y / image.height,
    width: frame.width / image.width,
    height: frame.height / image.height,
  };
}

export function moveCrop(crop: PhotoCrop, delta: Point): PhotoCrop {
  return {
    ...crop,
    x: clamp(crop.x + delta.x, 0, 1 - crop.width),
    y: clamp(crop.y + delta.y, 0, 1 - crop.height),
  };
}

export function zoomCrop(crop: PhotoCrop, image: Size, zoom: number): PhotoCrop {
  const ratio = (crop.width * image.width) / (crop.height * image.height);
  const full = normalizeCrop(cropRect(image, ratio), image);
  const factor = Math.max(1, zoom);
  const width = full.width / factor,
    height = full.height / factor;
  return {
    x: clamp(crop.x + (crop.width - width) / 2, 0, 1 - width),
    y: clamp(crop.y + (crop.height - height) / 2, 0, 1 - height),
    width,
    height,
  };
}

/** Resize about the opposite edge/corner; ratio is in normalized image coordinates. */
export function resizeCrop(
  crop: PhotoCrop,
  handle: CropHandle,
  delta: Point,
  ratio: number | null,
): PhotoCrop {
  const west = handle.includes('w'),
    east = handle.includes('e');
  const north = handle.includes('n'),
    south = handle.includes('s');
  const right = crop.x + crop.width,
    bottom = crop.y + crop.height;
  if (ratio === null) {
    const x = west ? clamp(crop.x + delta.x, 0, Math.max(0, right - MIN_SIDE)) : crop.x;
    const y = north ? clamp(crop.y + delta.y, 0, Math.max(0, bottom - MIN_SIDE)) : crop.y;
    const endX = east ? clamp(right + delta.x, Math.min(1, x + MIN_SIDE), 1) : right;
    const endY = south ? clamp(bottom + delta.y, Math.min(1, y + MIN_SIDE), 1) : bottom;
    return { x, y, width: endX - x, height: endY - y };
  }
  const horizontal = west || east,
    vertical = north || south;
  const anchorX = west ? right : east ? crop.x : crop.x + crop.width / 2;
  const anchorY = north ? bottom : south ? crop.y : crop.y + crop.height / 2;
  const desiredW = crop.width + (west ? -delta.x : delta.x);
  const desiredH = crop.height + (north ? -delta.y : delta.y);
  const wanted =
    horizontal && vertical
      ? (desiredW + desiredH * ratio) / 2
      : horizontal
        ? desiredW
        : desiredH * ratio;
  const maxW = horizontal ? (west ? anchorX : 1 - anchorX) : 2 * Math.min(anchorX, 1 - anchorX);
  const maxH = vertical ? (north ? anchorY : 1 - anchorY) : 2 * Math.min(anchorY, 1 - anchorY);
  const maxWidth = Math.min(maxW, maxH * ratio);
  const width = clamp(wanted, Math.min(maxWidth, Math.max(MIN_SIDE, MIN_SIDE * ratio)), maxWidth);
  const height = width / ratio;
  return {
    x: west ? anchorX - width : east ? anchorX : anchorX - width / 2,
    y: north ? anchorY - height : south ? anchorY : anchorY - height / 2,
    width,
    height,
  };
}
