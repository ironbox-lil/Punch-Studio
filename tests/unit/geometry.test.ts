import { describe, expect, it } from 'vitest';
import { cropRect, orientation, resolveRatio, RATIOS } from '../../src/domain/ratios';
import { createScene } from '../../src/domain/layout';
import { DEFAULT_SETTINGS } from '../../src/domain/types';

describe('crop and orientation', () => {
  it('selects the ratio retaining the largest original area', () => {
    for (const ratio of [0.4, 0.61, 0.8, 1, 1.1, 1.43, 1.72, 2.9]) {
      const selected = resolveRatio({ width: ratio * 1000, height: 1000 }, 'auto');
      const area = Math.min(selected.value / ratio, ratio / selected.value);
      expect(area).toBeCloseTo(
        Math.max(...RATIOS.map((r) => Math.min(r.value / ratio, ratio / r.value))),
        12,
      );
    }
  });
  it('centers a crop without stretching and honors explicit ratios', () => {
    expect(cropRect({ width: 400, height: 300 }, 1)).toEqual({
      x: 50,
      y: 0,
      width: 300,
      height: 300,
    });
    expect(resolveRatio({ width: 400, height: 300 }, '9:16').label).toBe('9:16');
    expect(orientation(3 / 4, 'auto')).toBe('horizontal');
    expect(orientation(4 / 3, 'auto')).toBe('vertical');
    expect(orientation(1, 'auto')).toBe('vertical');
    expect(orientation(3 / 4, 'vertical')).toBe('vertical');
  });
});

describe('layout contracts', () => {
  it('reshuffles matrix fragments even when rotation is disabled', () => {
    const settings = { ...DEFAULT_SETTINGS, fragmentLayout: 'matrix' as const, rotate: false };
    const a = createScene({ width: 800, height: 600 }, settings);
    const b = createScene({ width: 800, height: 600 }, { ...settings, fragmentSeed: 55 });
    expect(a.fragments.map((f) => f.source)).toEqual(b.fragments.map((f) => f.source));
    expect(a.fragments.map((f) => f.target)).not.toEqual(b.fragments.map((f) => f.target));
    expect(new Set(a.fragments.map((f) => JSON.stringify(f.target)))).toEqual(
      new Set(b.fragments.map((f) => JSON.stringify(f.target))),
    );
  });
  it('keeps large random holes apart near the frame edges', () => {
    for (const ratio of RATIOS)
      for (const seed of [7, 63, 842, 903]) {
        const scene = createScene(
          { width: 800, height: 600 },
          {
            ...DEFAULT_SETTINGS,
            ratio: ratio.label,
            sourceLayout: 'random',
            count: 4,
            size: 0.14,
            spread: 0.85,
            sourceSeed: seed,
          },
        );
        for (let i = 0; i < scene.fragments.length; i++) {
          const p = scene.fragments[i]!.source;
          for (let j = 0; j < i; j++) {
            const q = scene.fragments[j]!.source;
            expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(
              scene.size * Math.SQRT2 - 1e-10,
            );
          }
        }
      }
  });
  it('preserves the source when only the fragments are shuffled', () => {
    const a = createScene(
      { width: 3000, height: 4000 },
      { ...DEFAULT_SETTINGS, sourceLayout: 'random' },
    );
    const b = createScene(
      { width: 3000, height: 4000 },
      { ...DEFAULT_SETTINGS, sourceLayout: 'random', fragmentSeed: 5 },
    );
    expect(a.fragments.map((f) => f.source)).toEqual(b.fragments.map((f) => f.source));
    expect(a.fragments.map((f) => f.target)).not.toEqual(b.fragments.map((f) => f.target));
    expect(
      createScene({ width: 3000, height: 4000 }, { ...DEFAULT_SETTINGS, sourceLayout: 'random' }),
    ).toEqual(a);
  });
  it('preserves targets when source holes are shuffled', () => {
    const settings = { ...DEFAULT_SETTINGS, sourceLayout: 'random' as const };
    const a = createScene({ width: 800, height: 600 }, settings);
    const b = createScene({ width: 800, height: 600 }, { ...settings, sourceSeed: 22 });
    expect(a.fragments.map((f) => f.target)).toEqual(b.fragments.map((f) => f.target));
    expect(a.fragments.map((f) => f.source)).not.toEqual(b.fragments.map((f) => f.source));
  });
  it('keeps all fragments, avoids collisions, and contains rotated corners across proportions', () => {
    for (const ratio of RATIOS)
      for (const count of [4, 16, 40, 80])
        for (const seed of [1, 42, 678, 2345]) {
          const scene = createScene(
            { width: 4000, height: 3000 },
            {
              ...DEFAULT_SETTINGS,
              ratio: ratio.label,
              count,
              sourceLayout: 'random',
              overlap: false,
              size: 0.14,
              spread: 0.25,
              sourceSeed: seed,
              fragmentSeed: seed,
            },
          );
          expect(scene.fragments).toHaveLength(count);
          const radius = scene.size * Math.SQRT1_2;
          for (const key of ['source', 'target'] as const) {
            const points = scene.fragments.map((f) => f[key]);
            for (let i = 0; i < points.length; i++) {
              const p = points[i]!;
              expect(p.x - radius).toBeGreaterThanOrEqual(-1e-10);
              expect(p.y - radius).toBeGreaterThanOrEqual(-1e-10);
              expect(p.x + radius).toBeLessThanOrEqual(scene.frame.width + 1e-10);
              expect(p.y + radius).toBeLessThanOrEqual(1 + 1e-10);
              for (let j = 0; j < i; j++)
                expect(Math.hypot(p.x - points[j]!.x, p.y - points[j]!.y)).toBeGreaterThanOrEqual(
                  2 * radius - 1e-10,
                );
            }
          }
        }
  });
  it('reports automatic diameter reduction rather than silently dropping holes', () => {
    const scene = createScene(
      { width: 100, height: 100 },
      { ...DEFAULT_SETTINGS, rows: 8, columns: 10, size: 0.14, spread: 0.25, overlap: false },
    );
    expect(scene.fragments).toHaveLength(80);
    expect(scene.notices).toHaveLength(1);
    expect(scene.size).toBeLessThan(0.14);
  });
});
