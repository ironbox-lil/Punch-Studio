import { test, expect } from '@playwright/test';

test('surround keeps solid paper, transfers moved source pixels and exports a transparent paper center', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const assetsModule = '/src/imaging/assets.ts',
      renderModule = '/src/imaging/render.ts',
      typesModule = '/src/domain/types.ts';
    const { loadAsset, canvas, context } = (await import(
      assetsModule
    )) as typeof import('../../src/imaging/assets');
    const { renderArtwork, releaseRender, exportSize } = (await import(
      renderModule
    )) as typeof import('../../src/imaging/render');
    const { DEFAULT_SETTINGS } = (await import(
      typesModule
    )) as typeof import('../../src/domain/types');
    const source = canvas({ width: 400, height: 400 }),
      ctx = context(source);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 400);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(200, 0, 200, 400);
    const photo = await loadAsset(await (await fetch(source.toDataURL())).blob(), 'split.png');
    const settings = {
      ...DEFAULT_SETTINGS,
      composition: 'surround' as const,
      shape: 'circle' as const,
      color: '#123456',
      paperMode: 'texture' as const,
    };
    const scene: import('../../src/domain/types').Scene = {
      frame: { width: 1, height: 1 },
      ratioLabel: '1:1',
      size: 0.12,
      border: 0.25,
      orientation: 'surround',
      notices: [],
      fragments: [{ source: { x: 0.25, y: 0.25 }, target: { x: 0.25, y: 0.125 }, rotation: 0 }],
    };
    const pixel = (canvas: HTMLCanvasElement, x: number, y: number) =>
      Array.from(context(canvas).getImageData(x, y, 1, 1).data);
    // Even a patterned uploaded paper cannot turn the surround into a texture.
    const before = renderArtwork(photo, photo, settings, scene, 400);
    const pixels = {
      border: pixel(before.combined, 2, 2),
      hole: pixel(before.combined, 200, 200),
      fragment: pixel(before.combined, 100, 50),
      untouchedPhoto: pixel(before.combined, 400, 200),
      paperCenter: pixel(before.paper, 300, 300),
    };
    const sizes = {
      combined: exportSize(scene, 400),
      photo: exportSize(scene, 400, 'photo'),
      paper: exportSize(scene, 400, 'paper'),
    };
    const originalPhoto = before.photo.toDataURL();
    releaseRender(before);
    const targetOnly = renderArtwork(
      photo,
      photo,
      settings,
      {
        ...scene,
        fragments: [{ ...scene.fragments[0]!, target: { x: 0.75, y: 0.125 } }],
      },
      400,
    );
    const movedTarget = {
      oldPosition: pixel(targetOnly.paper, 100, 50),
      newPosition: pixel(targetOnly.paper, 300, 50),
      photoUnchanged: targetOnly.photo.toDataURL() === originalPhoto,
    };
    releaseRender(targetOnly);
    const after = renderArtwork(
      photo,
      photo,
      settings,
      { ...scene, fragments: [{ ...scene.fragments[0]!, source: { x: 0.75, y: 0.25 } }] },
      400,
    );
    const moved = {
      oldHole: pixel(after.combined, 200, 200),
      newHole: pixel(after.combined, 400, 200),
      fragment: pixel(after.combined, 100, 50),
    };
    releaseRender(after);
    photo.bitmap.close();
    return { pixels, sizes, moved, movedTarget };
  });
  expect(result.pixels).toEqual({
    border: [18, 52, 86, 255],
    hole: [18, 52, 86, 255],
    fragment: [255, 0, 0, 255],
    untouchedPhoto: [0, 255, 0, 255],
    paperCenter: [0, 0, 0, 0],
  });
  expect(result.sizes).toEqual({
    combined: { width: 600, height: 600 },
    photo: { width: 400, height: 400 },
    paper: { width: 600, height: 600 },
  });
  expect(result.moved).toEqual({
    oldHole: [255, 0, 0, 255],
    newHole: [18, 52, 86, 255],
    fragment: [0, 255, 0, 255],
  });
  expect(result.movedTarget).toEqual({
    oldPosition: [18, 52, 86, 255],
    newPosition: [255, 0, 0, 255],
    photoUnchanged: true,
  });
});

test('cutouts carry exact source pixels and eye centers remain untouched', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const assetModule = '/src/imaging/assets.ts';
    const rendererModule = '/src/imaging/render.ts';
    const typesModule = '/src/domain/types.ts';
    const { loadAsset, canvas, context } = (await import(
      assetModule
    )) as typeof import('../../src/imaging/assets');
    const { renderArtwork, releaseRender } = (await import(
      rendererModule
    )) as typeof import('../../src/imaging/render');
    const { DEFAULT_SETTINGS } = (await import(
      typesModule
    )) as typeof import('../../src/domain/types');
    const source = canvas({ width: 400, height: 400 });
    const ctx = context(source);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(200, 0, 200, 200);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 200, 200, 200);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(200, 200, 200, 200);
    const photo = await loadAsset(await (await fetch(source.toDataURL())).blob(), 'test.png');
    const scene: import('../../src/domain/types').Scene = {
      frame: { width: 1, height: 1 },
      ratioLabel: '1:1',
      size: 0.2,
      orientation: 'vertical',
      border: 0,
      notices: [],
      fragments: [{ source: { x: 0.25, y: 0.25 }, target: { x: 0.75, y: 0.75 }, rotation: 0 }],
    };
    const pixel = (element: HTMLCanvasElement, x: number, y: number) =>
      Array.from(context(element).getImageData(x, y, 1, 1).data);
    const circle = renderArtwork(
      photo,
      null,
      { ...DEFAULT_SETTINGS, shape: 'circle', color: '#123456' },
      scene,
      400,
    );
    const circlePixels = {
      hole: pixel(circle.photo, 100, 100),
      fragment: pixel(circle.paper, 300, 300),
      untouched: pixel(circle.photo, 300, 100),
    };
    releaseRender(circle);
    const eye = renderArtwork(
      photo,
      null,
      { ...DEFAULT_SETTINGS, shape: 'eye', color: '#123456' },
      scene,
      400,
    );
    const eyePixels = {
      holeCenter: pixel(eye.photo, 100, 100),
      fragmentCenter: pixel(eye.paper, 300, 300),
      holeRing: pixel(eye.photo, 126, 100),
      fragmentRing: pixel(eye.paper, 326, 300),
    };
    releaseRender(eye);
    // Reciprocal textured exchange must sample the target's original texture, even after rotation.
    const texture = await loadAsset(await (await fetch(source.toDataURL())).blob(), 'texture.png');
    const textured = renderArtwork(
      photo,
      texture,
      { ...DEFAULT_SETTINGS, shape: 'square' },
      { ...scene, fragments: [{ ...scene.fragments[0]!, rotation: 0.65 }] },
      400,
    );
    const texturePixels = {
      sourceReceivesTarget: pixel(textured.photo, 100, 100),
      targetReceivesSource: pixel(textured.paper, 300, 300),
    };
    releaseRender(textured);
    texture.bitmap.close();
    photo.bitmap.close();
    // Split colors through each patch center, so off-center samples detect wrong rotation signs.
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 100, 400);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(100, 0, 300, 400);
    const splitPhoto = await loadAsset(
      await (await fetch(source.toDataURL())).blob(),
      'split-photo.png',
    );
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(300, 0, 100, 400);
    const splitPaper = await loadAsset(
      await (await fetch(source.toDataURL())).blob(),
      'split-paper.png',
    );
    const rotated = renderArtwork(
      splitPhoto,
      splitPaper,
      { ...DEFAULT_SETTINGS, shape: 'square' },
      { ...scene, fragments: [{ ...scene.fragments[0]!, rotation: Math.PI / 2 }] },
      400,
    );
    const rotationPixels = {
      sourceBelow: pixel(rotated.photo, 100, 120),
      sourceAbove: pixel(rotated.photo, 100, 80),
      targetBelow: pixel(rotated.paper, 300, 320),
      targetAbove: pixel(rotated.paper, 300, 280),
    };
    releaseRender(rotated);
    splitPhoto.bitmap.close();
    splitPaper.bitmap.close();
    return { circlePixels, eyePixels, texturePixels, rotationPixels };
  });
  expect(result.circlePixels).toEqual({
    hole: [18, 52, 86, 255],
    fragment: [255, 0, 0, 255],
    untouched: [0, 255, 0, 255],
  });
  expect(result.eyePixels).toEqual({
    holeCenter: [255, 0, 0, 255],
    fragmentCenter: [18, 52, 86, 255],
    holeRing: [18, 52, 86, 255],
    fragmentRing: [255, 0, 0, 255],
  });
  expect(result.texturePixels).toEqual({
    sourceReceivesTarget: [255, 255, 0, 255],
    targetReceivesSource: [255, 0, 0, 255],
  });
  expect(result.rotationPixels).toEqual({
    sourceBelow: [0, 255, 255, 255],
    sourceAbove: [255, 0, 255, 255],
    targetBelow: [0, 255, 0, 255],
    targetAbove: [255, 0, 0, 255],
  });
});
