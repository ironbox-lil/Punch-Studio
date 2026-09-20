import type { Point, Scene, Size } from './types';

export function constrainHole(point: Point, frame: Size, size: number): Point {
  const radius = size * Math.SQRT1_2;
  return {
    x: Math.max(radius, Math.min(frame.width - radius, point.x)),
    y: Math.max(radius, Math.min(frame.height - radius, point.y)),
  };
}

export function moveHole(scene: Scene, index: number, desired: Point): Point[] | null {
  if (
    !Number.isInteger(index) ||
    !scene.fragments[index] ||
    !Number.isFinite(desired.x) ||
    !Number.isFinite(desired.y)
  )
    return null;
  const point = constrainHole(desired, scene.frame, scene.size);
  return scene.fragments.map((fragment, i) => {
    const source = i === index ? point : fragment.source;
    return { x: source.x / scene.frame.width, y: source.y / scene.frame.height };
  });
}
