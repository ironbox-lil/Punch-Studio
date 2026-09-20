import { orientation, resolveRatio } from './ratios';
import { photoCrop } from './crop';
import { constrainHole } from './holes';
import { constrainFragment, paperFrame } from './fragments';
import { surroundSizeLimit, surroundTargets } from './surround';
import type { EditorSettings, Point, Scene, Size } from './types';

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grid(count: number, columns: number, box: Size, center: Point): Point[] {
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => ({
    x: center.x - box.width / 2 + (((i % columns) + 0.5) * box.width) / columns,
    y: center.y - box.height / 2 + ((Math.floor(i / columns) + 0.5) * box.height) / rows,
  }));
}

function scattered(
  count: number,
  box: Size,
  center: Point,
  diameter: number,
  seed: number,
  overlap: boolean,
): Point[] {
  const random = seededRandom(seed);
  const points: Point[] = [];
  for (let attempt = 0; attempt < count * 300 && points.length < count; attempt++) {
    const point = {
      x: center.x + (random() - 0.5) * Math.max(0, box.width - diameter),
      y: center.y + (random() - 0.5) * Math.max(0, box.height - diameter),
    };
    if (overlap || points.every((p) => Math.hypot(p.x - point.x, p.y - point.y) >= diameter))
      points.push(point);
  }
  if (points.length === count) return points;
  // A jittered lattice guarantees every requested fragment fits, even in crowded scenes.
  const columns = Math.ceil(Math.sqrt((count * box.width) / box.height));
  const rows = Math.ceil(count / columns);
  const cellW = box.width / columns;
  const cellH = box.height / rows;
  return grid(count, columns, box, center).map((p) => ({
    x: p.x + (random() - 0.5) * Math.max(0, cellW - diameter) * 0.65,
    y: p.y + (random() - 0.5) * Math.max(0, cellH - diameter) * 0.65,
  }));
}

export function createScene(image: Size, settings: EditorSettings): Scene {
  const ratio = resolveRatio(
    settings.ratio === 'free' ? photoCrop(image, settings) : image,
    settings.ratio,
  );
  const frame = { width: ratio.value, height: 1 };
  const short = Math.min(frame.width, frame.height);
  const surround = settings.composition === 'surround';
  const border = surround ? short * Math.max(0.1, Math.min(0.6, settings.borderWidth)) : 0;
  const center = { x: frame.width / 2, y: 0.5 };
  const count =
    settings.sourceLayout === 'grid' ? settings.rows * settings.columns : settings.count;
  const sourceColumns =
    settings.sourceLayout === 'grid' ? settings.columns : Math.ceil(Math.sqrt(count * ratio.value));
  const sourceRows = Math.ceil(count / sourceColumns);
  const targetColumns = Math.ceil(Math.sqrt(count * ratio.value));
  const targetRows = Math.ceil(count / targetColumns);
  const targetBox = { width: frame.width * settings.spread, height: settings.spread };
  const sourceBox = { width: frame.width * 0.82, height: 0.82 };
  const sourceLimit =
    Math.min(sourceBox.width / sourceColumns, sourceBox.height / sourceRows) / 1.65;
  const targetLimit = surround
    ? surroundSizeLimit(
        frame,
        border,
        count,
        settings.fragmentLayout === 'matrix' || !settings.overlap,
      )
    : settings.fragmentLayout === 'matrix' || !settings.overlap
      ? Math.min(targetBox.width / targetColumns, targetBox.height / targetRows) / 1.65
      : short * 0.18;
  const requested = short * settings.size;
  const size = Math.min(requested, sourceLimit, targetLimit);
  const source =
    settings.sourcePositions?.length === count
      ? settings.sourcePositions.map((point) => ({
          x: point.x * frame.width,
          y: point.y * frame.height,
        }))
      : settings.sourceLayout === 'grid'
        ? grid(count, settings.columns, sourceBox, center)
        : scattered(count, sourceBox, center, size * Math.SQRT2 * 1.02, settings.sourceSeed, false);
  const target = surround
    ? surroundTargets(
        frame,
        border,
        count,
        size,
        settings.fragmentLayout === 'scatter',
        settings.overlap,
        settings.spread,
        seededRandom(settings.fragmentSeed),
      )
    : settings.fragmentLayout === 'matrix'
      ? grid(count, targetColumns, targetBox, center)
      : scattered(
          count,
          targetBox,
          center,
          size * Math.SQRT2 * 1.02,
          settings.fragmentSeed,
          settings.overlap,
        );
  if (settings.fragmentLayout === 'matrix') {
    const reorder = seededRandom(settings.fragmentSeed);
    for (let i = target.length - 1; i > 0; i--) {
      const j = Math.floor(reorder() * (i + 1));
      [target[i], target[j]] = [target[j]!, target[i]!];
    }
  }
  const random = seededRandom(settings.fragmentSeed + 123);
  const paper = paperFrame({ frame, border });
  const manualTargets =
    settings.targetPositions?.length === count ? settings.targetPositions : null;
  // Conservative bounds also contain square corners at any fragment rotation.
  const clamp = (p: Point): Point => constrainHole(p, frame, size);
  return {
    frame,
    ratioLabel: ratio.label,
    size,
    orientation: orientation(ratio.value, settings.composition),
    border,
    fragments: source.map((point, i) => ({
      source: clamp(point),
      target: manualTargets
        ? constrainFragment(
            { x: manualTargets[i]!.x * paper.width, y: manualTargets[i]!.y * paper.height },
            { frame, border, size },
          )
        : surround
          ? target[i]!
          : clamp(target[i]!),
      rotation: settings.rotate ? (random() - 0.5) * Math.PI * 0.7 : 0,
    })),
    notices:
      size < requested - 0.00001
        ? ['为容纳全部碎片，孔径已自动缩小；减少数量或放宽排列可增大孔径。']
        : [],
  };
}
