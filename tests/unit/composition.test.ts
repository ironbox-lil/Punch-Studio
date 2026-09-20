import { describe, expect, it } from 'vitest';
import { compositionGeometry } from '../../src/domain/composition';
import { moveHole } from '../../src/domain/holes';
import { moveFragment, paperFrame } from '../../src/domain/fragments';
import { createScene } from '../../src/domain/layout';
import { RATIOS } from '../../src/domain/ratios';
import { DEFAULT_SETTINGS } from '../../src/domain/types';

describe('surround composition', () => {
  it('keeps every rotated fragment inside the outer paper and outside the photo without collisions', () => {
    for (const ratio of RATIOS)
      for (const count of [4, 16, 80])
        for (const borderWidth of [0.1, 0.28, 0.6])
          for (const fragmentLayout of ['matrix', 'scatter'] as const) {
            const scene = createScene(
              { width: 800, height: 600 },
              {
                ...DEFAULT_SETTINGS,
                ratio: ratio.label,
                composition: 'surround',
                borderWidth,
                sourceLayout: 'random',
                count,
                size: 0.14,
                overlap: false,
                fragmentLayout,
              },
            );
            expect(scene.fragments).toHaveLength(count);
            const r = scene.size * Math.SQRT1_2;
            const b = scene.border,
              width = scene.frame.width + 2 * b,
              height = 1 + 2 * b;
            for (let i = 0; i < count; i++) {
              const target = scene.fragments[i]!.target;
              expect(target.x - r).toBeGreaterThanOrEqual(-1e-9);
              expect(target.y - r).toBeGreaterThanOrEqual(-1e-9);
              expect(target.x + r).toBeLessThanOrEqual(width + 1e-9);
              expect(target.y + r).toBeLessThanOrEqual(height + 1e-9);
              expect(
                target.x + r <= b + 1e-9 ||
                  target.x - r >= b + scene.frame.width - 1e-9 ||
                  target.y + r <= b + 1e-9 ||
                  target.y - r >= b + 1 - 1e-9,
              ).toBe(true);
              for (let j = 0; j < i; j++) {
                const other = scene.fragments[j]!.target;
                expect(Math.hypot(target.x - other.x, target.y - other.y)).toBeGreaterThanOrEqual(
                  2 * r - 1e-9,
                );
              }
            }
          }
  });

  it('uses equal pixel borders and correct photo offsets for every composition and ordering', () => {
    const base = createScene({ width: 800, height: 600 }, DEFAULT_SETTINGS);
    for (const paperFirst of [true, false]) {
      const horizontal = compositionGeometry(
        { ...base, orientation: 'horizontal' },
        800,
        paperFirst,
      );
      expect(horizontal.combined).toEqual({ width: 1600, height: 600 });
      expect(horizontal.photo.x).toBe(paperFirst ? 800 : 0);
      const vertical = compositionGeometry({ ...base, orientation: 'vertical' }, 800, paperFirst);
      expect(vertical.combined).toEqual({ width: 800, height: 1200 });
      expect(vertical.photo.y).toBe(paperFirst ? 600 : 0);
      const surround = compositionGeometry(
        { ...base, orientation: 'surround', border: 0.25 },
        800,
        paperFirst,
      );
      expect(surround.combined).toEqual({ width: 1100, height: 900 });
      expect(surround.photo).toEqual({ x: 150, y: 150, width: 800, height: 600 });
      expect(surround.paper).toEqual({ x: 0, y: 0, width: 1100, height: 900 });
    }
  });
});

describe('manual paper fragments', () => {
  it('moves only the selected target without changing source pixels, rotation, size or other targets', () => {
    for (const composition of ['horizontal', 'vertical', 'surround'] as const) {
      const settings = { ...DEFAULT_SETTINGS, composition, fragmentLayout: 'matrix' as const };
      const image = { width: 800, height: 600 };
      const scene = createScene(image, settings);
      const desired = { x: 0.5, y: composition === 'surround' ? 0.1 : 0.3 };
      const targetPositions = moveFragment(scene, 2, desired)!;
      const moved = createScene(image, { ...settings, targetPositions });
      expect(moved.size).toBe(scene.size);
      expect(moved.fragments[2]!.target.x).toBeCloseTo(desired.x);
      expect(moved.fragments[2]!.target.y).toBeCloseTo(desired.y);
      moved.fragments.forEach((fragment, index) => {
        expect(fragment.source).toEqual(scene.fragments[index]!.source);
        expect(fragment.rotation).toBe(scene.fragments[index]!.rotation);
        if (index !== 2) {
          expect(fragment.target.x).toBeCloseTo(scene.fragments[index]!.target.x, 12);
          expect(fragment.target.y).toBeCloseTo(scene.fragments[index]!.target.y, 12);
        }
      });
      const sourcePositions = moveHole(moved, 2, { x: 0.4, y: 0.5 });
      const movedBoth = createScene(image, { ...settings, targetPositions, sourcePositions });
      expect(movedBoth.fragments.map((f) => f.target)).toEqual(
        moved.fragments.map((f) => f.target),
      );
      expect(moveFragment(scene, -1, desired)).toBeNull();
      expect(moveFragment(scene, 0.5, desired)).toBeNull();
      expect(moveFragment(scene, 0, { x: Infinity, y: 0.5 })).toBeNull();
    }
  });

  it('contains manual fragments at outer edges and excludes the central photo after border or ratio changes', () => {
    const image = { width: 800, height: 600 };
    const original = createScene(image, { ...DEFAULT_SETTINGS, composition: 'surround' });
    for (const desired of [
      { x: -100, y: 100 },
      { x: 100, y: -100 },
      { x: 0.8, y: 0.8 },
    ]) {
      const targetPositions = moveFragment(original, 0, desired);
      for (const ratio of RATIOS)
        for (const borderWidth of [0.1, 0.28, 0.6]) {
          const scene = createScene(image, {
            ...DEFAULT_SETTINGS,
            composition: 'surround',
            ratio: ratio.label,
            borderWidth,
            size: 0.14,
            targetPositions,
          });
          const frame = paperFrame(scene),
            r = scene.size * Math.SQRT1_2,
            b = scene.border;
          for (const { target } of scene.fragments) {
            expect(target.x).toBeGreaterThanOrEqual(r - 1e-9);
            expect(target.y).toBeGreaterThanOrEqual(r - 1e-9);
            expect(target.x).toBeLessThanOrEqual(frame.width - r + 1e-9);
            expect(target.y).toBeLessThanOrEqual(frame.height - r + 1e-9);
            expect(
              target.x + r <= b + 1e-9 ||
                target.x - r >= b + scene.frame.width - 1e-9 ||
                target.y + r <= b + 1e-9 ||
                target.y - r >= b + scene.frame.height - 1e-9,
            ).toBe(true);
          }
        }
    }
  });

  it('preserves relative paper positions when switching between paired layouts and changing ratio', () => {
    const image = { width: 800, height: 600 };
    const original = createScene(image, { ...DEFAULT_SETTINGS, ratio: '1:1' });
    const targetPositions = moveFragment(original, 0, { x: 0.3, y: 0.7 });
    const changed = createScene(image, {
      ...DEFAULT_SETTINGS,
      targetPositions,
      ratio: '3:4',
      composition: 'horizontal',
      paperFirst: false,
    });
    expect(changed.fragments[0]!.target.x).toBeCloseTo(0.225);
    expect(changed.fragments[0]!.target.y).toBeCloseTo(0.7);
  });
});

describe('manual source holes', () => {
  it('moves just one source and preserves fragment targets, rotation and other sources', () => {
    const settings = { ...DEFAULT_SETTINGS, composition: 'surround' as const };
    const scene = createScene({ width: 800, height: 600 }, settings);
    const positions = moveHole(scene, 0, { x: 0.73, y: 0.42 });
    const moved = createScene(
      { width: 800, height: 600 },
      { ...settings, sourcePositions: positions },
    );
    expect(moved.fragments[0]!.source.x).toBeCloseTo(0.73);
    expect(moved.fragments[0]!.source.y).toBeCloseTo(0.42);
    expect(moved.fragments.slice(1)).toEqual(scene.fragments.slice(1));
    expect(moved.fragments.map((f) => [f.target, f.rotation])).toEqual(
      scene.fragments.map((f) => [f.target, f.rotation]),
    );
    const shuffled = createScene(
      { width: 800, height: 600 },
      { ...settings, sourcePositions: positions, fragmentSeed: 14 },
    );
    expect(shuffled.fragments.map((f) => f.source)).toEqual(moved.fragments.map((f) => f.source));
    expect(shuffled.fragments.map((f) => f.target)).not.toEqual(
      moved.fragments.map((f) => f.target),
    );
  });

  it('contains dragged masks at edges and preserves relative positions when the crop ratio changes', () => {
    const scene = createScene({ width: 800, height: 600 }, DEFAULT_SETTINGS);
    const positions = moveHole(scene, 2, { x: -100, y: 100 })!;
    const moved = createScene(
      { width: 800, height: 600 },
      { ...DEFAULT_SETTINGS, sourcePositions: positions },
    );
    const radius = moved.size * Math.SQRT1_2;
    expect(moved.fragments[2]!.source.x).toBeCloseTo(radius);
    expect(moved.fragments[2]!.source.y).toBeCloseTo(1 - radius);
    const interior = moveHole(scene, 0, { x: scene.frame.width * 0.4, y: 0.6 });
    const portrait = createScene(
      { width: 800, height: 600 },
      { ...DEFAULT_SETTINGS, ratio: '3:4', sourcePositions: interior },
    );
    expect(portrait.fragments[0]!.source.x).toBeCloseTo(0.3, 12);
    expect(portrait.fragments[0]!.source.y).toBeCloseTo(0.6, 12);
    expect(moveHole(scene, 100, { x: 0.5, y: 0.5 })).toBeNull();
    expect(moveHole(scene, 0, { x: NaN, y: 0.5 })).toBeNull();
  });
});
