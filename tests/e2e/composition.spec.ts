import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const pixels = await sharp(
  Buffer.from(
    '<svg width="800" height="600"><rect width="400" height="600" fill="#ff0000"/><rect x="400" width="400" height="600" fill="#00ff00"/></svg>',
  ),
)
  .png()
  .toBuffer();
const file = { name: '拖动验收.png', mimeType: 'image/png', buffer: pixels };

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '底色 #193BCB', exact: true }).click();
  await page.getByRole('button', { name: '形状 圆点', exact: true }).click();
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByLabel('画面比例').selectOption('1:1');
  await expect(page.getByTestId('hole-0')).toBeVisible();
}

async function moveFirst(page: Page, dx: number, dy: number, id = 'hole-0') {
  const hole = page.getByTestId(id);
  const before = (await hole.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + dx, before.y + before.height / 2 + dy, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = (await hole.boundingBox())!;
      return after.x + after.width / 2 - (before.x + before.width / 2);
    })
    .toBeCloseTo(dx, 0);
  await expect
    .poll(async () => {
      const after = (await hole.boundingBox())!;
      return after.y + after.height / 2 - (before.y + before.height / 2);
    })
    .toBeCloseTo(dy, 0);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/recommendations', (route) =>
    route.fulfill({ status: 503, json: { error: '测试不调用模型' } }),
  );
});

test('paper fragments drag independently in every composition and export at their edited positions', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/recommendations', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: '不应调用' } });
  });
  await setup(page);
  await page.getByRole('button', { name: '紧凑矩阵', exact: true }).click();
  await page.getByTestId('hole-0').press('ArrowRight');
  const targets = () =>
    page.getByRole('button', { name: /^拖动第 \d+ 个碎片$/ }).evaluateAll((elements) =>
      elements.map((element) => {
        const matrix = (element as SVGGElement).transform.baseVal.consolidate()!.matrix;
        return { x: Number(matrix.e.toFixed(6)), y: Number(matrix.f.toFixed(6)) };
      }),
    );
  const sources = () =>
    page
      .getByRole('button', { name: /^拖动第 \d+ 个孔$/ })
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('transform')));
  for (const layout of ['左右', '上下', '外围色纸']) {
    await page.getByRole('button', { name: layout, exact: true }).click();
    for (let order = 0; order < (layout === '外围色纸' ? 1 : 2); order++) {
      if (order) await page.getByRole('button', { name: '交换顺序', exact: true }).click();
      await expect(page.getByText('实时预览已更新', { exact: true })).toBeVisible();
      await page.getByTestId('fragment-0').scrollIntoViewIfNeeded();
      const previousSources = await sources(),
        previousTargets = await targets();
      await moveFirst(page, 18, 12, 'fragment-0');
      expect(await sources()).toEqual(previousSources);
      expect((await targets()).slice(1)).toEqual(previousTargets.slice(1));
      const manual = await targets();
      const piece = (await page.getByTestId('fragment-0').boundingBox())!;
      const x = piece.x + piece.width / 2,
        y = piece.y + piece.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 10, y + 5, { steps: 4 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(await targets()).toEqual(manual);
      await page.getByTestId('hole-0').press('ArrowRight');
      expect(await targets()).toEqual(manual);
      await page.getByTestId('fragment-0').press('ArrowRight');
      expect(await targets()).not.toEqual(manual);
      if (layout !== '外围色纸') {
        await page.getByRole('button', { name: '恢复自动碎片排列', exact: true }).click();
        expect(await targets()).toEqual(previousTargets);
        await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toBeVisible();
      }
    }
  }
  await page.getByLabel('导出分辨率').selectOption('1024');
  for (const part of ['combined', 'paper']) {
    await page.getByLabel('导出内容').selectOption(part);
    const piece = (await page.getByTestId('fragment-0').boundingBox())!;
    const canvas = (await page.getByTestId('artwork').boundingBox())!;
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出作品', exact: false }).click();
    const path = (await (await download).path())!;
    const metadata = await sharp(path).metadata();
    expect([metadata.width, metadata.height]).toEqual([1598, 1598]);
    const pixel = await sharp(path)
      .extract({
        left: Math.round(((piece.x + piece.width / 2 - canvas.x) / canvas.width) * metadata.width!),
        top: Math.round(
          ((piece.y + piece.height / 2 - canvas.y) / canvas.height) * metadata.height!,
        ),
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect([...pixel]).toEqual([255, 0, 0]);
  }
  const previousSources = await sources();
  await page.getByRole('button', { name: '换一种碎片排列', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复自动碎片排列', exact: true })).toHaveCount(0);
  expect(await sources()).toEqual(previousSources);
  await page.getByTestId('fragment-0').press('ArrowRight');
  await page.getByRole('slider', { name: '行数', exact: true }).press('ArrowRight');
  await expect(page.getByRole('button', { name: '恢复自动碎片排列', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^拖动第 \d+ 个碎片$/ })).toHaveCount(20);
  expect(calls).toBe(0);
});

test('paper fragments support touch, cancellation and recommendation comparison on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '使用内置灵感', exact: true }).click();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await page.getByRole('button', { name: '外围色纸', exact: true }).click();
  await page.getByRole('button', { name: '环绕排列', exact: true }).click();
  const fragment = page.getByTestId('fragment-0');
  await fragment.scrollIntoViewIfNeeded();
  const before = (await fragment.boundingBox())!;
  const x = before.x + before.width / 2,
    y = before.y + before.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 10, y: y + 3 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => {
      const after = (await fragment.boundingBox())!;
      return after.x + after.width / 2 - x;
    })
    .toBeCloseTo(10, 0);
  const manual = await fragment.getAttribute('transform');
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x + 10, y: y + 3 }],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 15, y: y + 5 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(fragment).toHaveAttribute('transform', manual!);
  await touch.detach();
  await page.getByLabel('采用推荐 2', { exact: true }).click();
  await expect(fragment).toHaveAttribute('transform', manual!);
  await expect(page.getByRole('button', { name: /^采用推荐 [123]$/ })).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('holes remain draggable in each composition and ordering and export their edited positions', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/recommendations', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: '不应调用' } });
  });
  await setup(page);
  for (const layout of ['左右', '上下', '外围色纸']) {
    await page.getByRole('button', { name: layout, exact: true }).click();
    await expect(page.getByText('实时预览已更新', { exact: true })).toBeVisible();
    await page.getByTestId('hole-0').scrollIntoViewIfNeeded();
    const other = await page.getByTestId('hole-1').boundingBox();
    const original = (await page.getByTestId('hole-0').boundingBox())!;
    await moveFirst(page, 24, 16);
    expect((await page.getByTestId('hole-1').boundingBox())!.x).toBeCloseTo(other!.x, 1);
    await page.getByRole('button', { name: '换一种碎片排列', exact: true }).click();
    const shuffled = (await page.getByTestId('hole-0').boundingBox())!;
    expect(shuffled.x + shuffled.width / 2).toBeCloseTo(original.x + original.width / 2 + 24, 0);
    if (layout !== '外围色纸') {
      await page.getByRole('button', { name: '交换顺序', exact: true }).click();
      await moveFirst(page, 12, 8);
    } else {
      await expect(page.getByRole('button', { name: '交换顺序', exact: true })).toBeDisabled();
    }
    await page.getByRole('button', { name: '恢复自动孔位', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toHaveCount(0);
  }
  const canceled = (await page.getByTestId('hole-0').boundingBox())!;
  const cancelX = canceled.x + canceled.width / 2,
    cancelY = canceled.y + canceled.height / 2;
  await page.mouse.move(cancelX, cancelY);
  await page.mouse.down();
  await page.mouse.move(cancelX + 25, cancelY + 20, { steps: 5 });
  await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toHaveCount(0);
  const restored = (await page.getByTestId('hole-0').boundingBox())!;
  expect(restored.x + restored.width / 2).toBeCloseTo(cancelX, 1);
  expect(restored.y + restored.height / 2).toBeCloseTo(cancelY, 1);
  await moveFirst(page, 35, 22);
  await page.getByTestId('hole-0').press('ArrowRight');
  await page.getByLabel('导出分辨率').selectOption('1024');
  const hole = (await page.getByTestId('hole-0').boundingBox())!;
  const canvas = (await page.getByTestId('artwork').boundingBox())!;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  const path = (await (await download).path())!;
  const metadata = await sharp(path).metadata();
  expect([metadata.width, metadata.height]).toEqual([1598, 1598]);
  const x = Math.round(((hole.x + hole.width / 2 - canvas.x) / canvas.width) * metadata.width!);
  const y = Math.round(((hole.y + hole.height / 2 - canvas.y) / canvas.height) * metadata.height!);
  const pixel = await sharp(path)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel]).toEqual([25, 59, 203]);
  await page.getByLabel('导出内容').selectOption('paper');
  const paperDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  const paper = (await (await paperDownload).path())!;
  const center = await sharp(paper)
    .extract({ left: 799, top: 799, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(center[3]).toBe(0);
  await mkdir('artifacts/acceptance', { recursive: true });
  await page.screenshot({ path: 'artifacts/acceptance/surround-and-holes.png', fullPage: true });
  await page.getByRole('slider', { name: '行数', exact: true }).press('ArrowRight');
  await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^拖动第 \d+ 个孔$/ })).toHaveCount(20);
  expect(calls).toBe(0);
});

test('surround uses a solid color from uploaded paper and follows border-width changes', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel('上传色纸', { exact: true })
    .setInputFiles({ ...file, name: '双色纹理.png' });
  await expect(page.getByRole('button', { name: '保留纹理', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '外围色纸', exact: true }).click();
  await expect(page.getByRole('button', { name: '保留纹理', exact: true })).toHaveCount(0);
  const color = await page.getByLabel('HEX 颜色').getAttribute('placeholder');
  expect(color).toMatch(/^#[A-F\d]{6}$/);
  await expect
    .poll(() =>
      page.getByTestId('artwork').evaluate((element) => {
        const canvas = element as HTMLCanvasElement,
          ctx = canvas.getContext('2d')!;
        return [
          Array.from(ctx.getImageData(1, 1, 1, 1).data),
          Array.from(ctx.getImageData(canvas.width - 2, canvas.height - 2, 1, 1).data),
        ];
      }),
    )
    .toEqual(
      [color, color].map((value) => [
        parseInt(value!.slice(1, 3), 16),
        parseInt(value!.slice(3, 5), 16),
        parseInt(value!.slice(5, 7), 16),
        255,
      ]),
    );
  const before = await page.getByTestId('artwork').getAttribute('width');
  await page.getByRole('slider', { name: '外围宽度', exact: true }).press('End');
  await expect.poll(() => page.getByTestId('artwork').getAttribute('width')).not.toBe(before);
  await page.getByRole('button', { name: '环绕排列', exact: true }).click();
  await expect(page.getByRole('button', { name: '环绕排列', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('touch drag works on a narrow screen and preserves adopted local recommendations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '使用内置灵感', exact: true }).click();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await page.getByRole('button', { name: '外围色纸', exact: true }).click();
  await page.getByTestId('hole-0').scrollIntoViewIfNeeded();
  const hole = page.getByTestId('hole-0'),
    before = (await hole.boundingBox())!;
  const x = before.x + before.width / 2,
    y = before.y + before.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 25, y: y + 15 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => {
      const after = (await hole.boundingBox())!;
      return after.x + after.width / 2 - x;
    })
    .toBeCloseTo(25, 0);
  await touch.detach();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '恢复自动孔位', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复自动孔位', exact: true })).toHaveCount(0);
});
