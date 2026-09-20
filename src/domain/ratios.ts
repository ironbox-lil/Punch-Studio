import type { Composition, Size } from './types';

export const RATIOS = [
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
  { label: '5:4', value: 5 / 4 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
] as const;

export function resolveRatio(image: Size, selected: string) {
  if (!(image.width > 0 && image.height > 0)) throw new Error('图片尺寸无效');
  if (selected === 'free') return { label: '自由裁剪', value: image.width / image.height };
  const explicit = RATIOS.find((ratio) => ratio.label === selected);
  if (explicit) return explicit;
  const original = image.width / image.height;
  return RATIOS.reduce((best, ratio) =>
    Math.abs(Math.log(original / ratio.value)) < Math.abs(Math.log(original / best.value))
      ? ratio
      : best,
  );
}

export function cropRect(image: Size, ratio: number) {
  const width = Math.min(image.width, image.height * ratio);
  const height = width / ratio;
  return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height };
}

export function orientation(ratio: number, selected: Composition) {
  return selected === 'auto' ? (ratio < 1 ? 'horizontal' : 'vertical') : selected;
}

export function panelSize(ratio: number, longEdge: number): Size {
  return ratio >= 1
    ? {
        width: Math.max(1, Math.round(longEdge)),
        height: Math.max(1, Math.round(longEdge / ratio)),
      }
    : {
        width: Math.max(1, Math.round(longEdge * ratio)),
        height: Math.max(1, Math.round(longEdge)),
      };
}
