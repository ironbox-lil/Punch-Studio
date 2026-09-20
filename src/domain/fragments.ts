import { constrainHole } from './holes';
import type { Point, Scene } from './types';

type PaperGeometry = Pick<Scene, 'frame' | 'border'>;

export function paperFrame({ frame, border }: PaperGeometry) {
  return { width: frame.width + 2 * border, height: frame.height + 2 * border };
}

/** Keep rotated cutouts inside the paper and, for a surround, outside the central photo. */
export function constrainFragment(point: Point, scene: PaperGeometry & Pick<Scene, 'size'>): Point {
  const bounded = constrainHole(point, paperFrame(scene), scene.size);
  if (!scene.border) return bounded;
  const radius = scene.size * Math.SQRT1_2;
  const left = scene.border - radius,
    right = scene.border + scene.frame.width + radius,
    top = scene.border - radius,
    bottom = scene.border + scene.frame.height + radius;
  if (bounded.x <= left || bounded.x >= right || bounded.y <= top || bounded.y >= bottom)
    return bounded;
  // Project to the closest valid edge rather than letting a fragment disappear under the photo.
  const candidates = [
    { x: bounded.x, y: top },
    { x: bounded.x, y: bottom },
    { x: left, y: bounded.y },
    { x: right, y: bounded.y },
  ];
  return candidates.reduce((nearest, candidate) =>
    Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) <
    Math.hypot(nearest.x - bounded.x, nearest.y - bounded.y)
      ? candidate
      : nearest,
  );
}

export function moveFragment(scene: Scene, index: number, desired: Point): Point[] | null {
  if (
    !Number.isInteger(index) ||
    !scene.fragments[index] ||
    !Number.isFinite(desired.x) ||
    !Number.isFinite(desired.y)
  )
    return null;
  const point = constrainFragment(desired, scene);
  const frame = paperFrame(scene);
  return scene.fragments.map((fragment, i) => {
    const target = i === index ? point : fragment.target;
    return { x: target.x / frame.width, y: target.y / frame.height };
  });
}
