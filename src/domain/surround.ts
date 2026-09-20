import type { Point, Size } from './types';

export function surroundPerimeter(frame: Size, border: number) {
  return 2 * (frame.width + frame.height + 2 * border);
}

export function surroundSizeLimit(frame: Size, border: number, count: number, separated: boolean) {
  return Math.min(
    (border * 0.9) / Math.SQRT2,
    separated ? (surroundPerimeter(frame, border) / count) * 0.4 : Infinity,
  );
}

function perimeterPoint(frame: Size, border: number, distance: number): Point {
  const w = frame.width + border,
    h = frame.height + border,
    offset = border / 2;
  let t = distance % (2 * (w + h));
  if (t < w) return { x: offset + t, y: offset };
  t -= w;
  if (t < h) return { x: offset + w, y: offset + t };
  t -= h;
  if (t < w) return { x: offset + w - t, y: offset + h };
  return { x: offset, y: offset + h - (t - w) };
}

export function surroundTargets(
  frame: Size,
  border: number,
  count: number,
  size: number,
  scatter: boolean,
  overlap: boolean,
  spread: number,
  random: () => number,
): Point[] {
  const perimeter = surroundPerimeter(frame, border);
  const slots = Array.from({ length: count }, (_, i) =>
    perimeterPoint(frame, border, ((i + 0.5) * perimeter) / count),
  );
  if (!scatter) return slots;
  const radius = size * Math.SQRT1_2;
  let jitter = Math.max(0, border / 2 - radius);
  if (!overlap) {
    let closest = Infinity;
    for (let i = 0; i < slots.length; i++)
      for (let j = 0; j < i; j++) {
        closest = Math.min(
          closest,
          Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.y - slots[j]!.y),
        );
      }
    jitter = Math.min(jitter, Math.max(0, (closest - 2 * radius) / 2));
  }
  return slots.map((slot) => {
    const base = overlap ? perimeterPoint(frame, border, random() * perimeter) : slot;
    const angle = random() * Math.PI * 2;
    const distance = random() * jitter * Math.min(1, spread / 0.85) * 0.9;
    return { x: base.x + Math.cos(angle) * distance, y: base.y + Math.sin(angle) * distance };
  });
}
