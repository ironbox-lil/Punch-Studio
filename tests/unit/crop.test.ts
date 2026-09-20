import { describe, expect, it } from 'vitest';
import {
  CROP_HANDLES,
  fitCrop,
  moveCrop,
  normalizeCrop,
  photoCrop,
  resizeCrop,
  zoomCrop,
} from '../../src/domain/crop';
import { createScene } from '../../src/domain/layout';
import { panelSize } from '../../src/domain/ratios';
import { DEFAULT_SETTINGS, type PhotoCrop } from '../../src/domain/types';

function inBounds(crop: PhotoCrop) {
  expect(crop.x).toBeGreaterThanOrEqual(-1e-10);
  expect(crop.y).toBeGreaterThanOrEqual(-1e-10);
  expect(crop.width).toBeGreaterThan(0);
  expect(crop.height).toBeGreaterThan(0);
  expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-10);
  expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-10);
}

describe('nondestructive photo cropping', () => {
  it('uses the original-coordinate region and arbitrary aspect ratio throughout the scene', () => {
    const image = { width: 800, height: 600 };
    const crop = { x: 0.5, y: 0.1, width: 0.2, height: 0.5 };
    const settings = { ...DEFAULT_SETTINGS, ratio: 'free', crop };
    expect(photoCrop(image, settings)).toEqual({ x: 400, y: 60, width: 160, height: 300 });
    const scene = createScene(image, settings);
    expect(scene.frame.width).toBeCloseTo(160 / 300);
    expect(scene.ratioLabel).toBe('自由裁剪');
    expect(scene.orientation).toBe('horizontal');
    expect(photoCrop(image, { ratio: '1:1', crop })).toEqual({
      x: 400,
      y: 130,
      width: 160,
      height: 160,
    });
    expect(photoCrop(image, { ratio: '1:1', crop: null })).toEqual({
      x: 100,
      y: 0,
      width: 600,
      height: 600,
    });
  });

  it('contains every drag and keeps the opposite anchor and locked ratio intact', () => {
    for (const image of [
      { width: 800, height: 600 },
      { width: 600, height: 800 },
      { width: 4000, height: 300 },
    ]) {
      for (const ratio of [null, 1, 16 / 9, 3 / 4]) {
        const initial = { x: 0.1, y: 0.15, width: 0.8, height: 0.7 };
        const crop = ratio ? fitCrop(initial, image, ratio) : initial;
        for (const handle of CROP_HANDLES)
          for (const delta of [
            { x: -2, y: -2 },
            { x: 2, y: 2 },
            { x: 0.14, y: -0.09 },
          ]) {
            const next = resizeCrop(
              crop,
              handle,
              delta,
              ratio === null ? null : (ratio * image.height) / image.width,
            );
            inBounds(next);
            if (ratio !== null)
              expect((next.width * image.width) / (next.height * image.height)).toBeCloseTo(
                ratio,
                10,
              );
            if (handle.includes('e')) expect(next.x).toBeCloseTo(crop.x);
            if (handle.includes('w')) expect(next.x + next.width).toBeCloseTo(crop.x + crop.width);
            if (handle.includes('s')) expect(next.y).toBeCloseTo(crop.y);
            if (handle.includes('n'))
              expect(next.y + next.height).toBeCloseTo(crop.y + crop.height);
          }
      }
    }
  });

  it('keeps tiny edge crops valid when a free handle is dragged outward', () => {
    const crop = { x: 0.999, y: 0.998, width: 0.001, height: 0.002 };
    for (const handle of CROP_HANDLES) inBounds(resizeCrop(crop, handle, { x: 2, y: 2 }, null));
  });

  it('zooms around the selection center, clamps movement and can recover the full image', () => {
    const image = { width: 800, height: 600 };
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    const zoomed = zoomCrop(crop, image, 2);
    expect(zoomed).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    const moved = moveCrop(zoomed, { x: 10, y: -10 });
    expect(moved).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(zoomCrop(moved, image, 1)).toEqual(crop);
    expect(normalizeCrop(photoCrop(image, { ratio: 'free', crop }), image)).toEqual(crop);
  });

  it('never rounds an extreme free-aspect output dimension down to zero', () => {
    expect(panelSize(0.0001, 1024)).toEqual({ width: 1, height: 1024 });
    expect(panelSize(10000, 1024)).toEqual({ width: 1024, height: 1 });
  });
});
