import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const testPhoto = await sharp({
  create: { width: 800, height: 600, channels: 3, background: '#b47554' },
})
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();
const file = { name: '旋转方向验收.jpg', mimeType: 'image/jpeg', buffer: testPhoto };
const recs = [
  { color: '#123ABC', shape: 'eye', reason: '呼应建筑的明暗层次。' },
  { color: '#D97755', shape: 'circle', reason: '用圆点收集照片细节。' },
  { color: '#37533F', shape: 'swallow', reason: '绿色与轻盈的燕子。' },
];

// UI regressions must never reach the real, potentially billable provider.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/recommendations', (route) =>
    route.fulfill({ status: 503, json: { error: '测试中未配置推荐响应' } }),
  );
});

async function manualSetup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '底色 #193BCB', exact: true }).click();
  await page.getByRole('button', { name: '形状 眼睛', exact: true }).click();
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await expect(page.getByTestId('artwork')).toBeVisible();
}

test('manual workflow honors EXIF, ratios, independent shuffle and PNG export without AI calls', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/recommendations', async (route) => {
    calls++;
    await route.fulfill({ status: 500, json: { error: '不应调用' } });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await manualSetup(page);
  await expect(page.getByText('600 × 800', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画面比例')).toHaveValue('auto');
  await expect(page.getByText('左右双联 · 3:4')).toBeVisible();
  const before = await page
    .getByTestId('artwork')
    .evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: '换一种碎片排列' }).click();
  await expect
    .poll(() =>
      page.getByTestId('artwork').evaluate((element) => (element as HTMLCanvasElement).toDataURL()),
    )
    .not.toBe(before);
  await page.getByLabel('画面比例').selectOption('16:9');
  await expect(page.getByText('上下双联 · 16:9')).toBeVisible();
  await page.getByLabel('画面比例').selectOption('3:4');
  await page.getByLabel('导出分辨率').selectOption('1024');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  const saved = await download;
  const metadata = await sharp((await saved.path())!).metadata();
  expect([metadata.width, metadata.height, metadata.format]).toEqual([1536, 1024, 'png']);
  expect(calls).toBe(0);
  expect(errors).toEqual([]);
});

test('AI supplies only missing settings and requires adoption', async ({ page }) => {
  const bodies: { color?: string; shape?: string; image?: string }[] = [];
  await page.route('**/api/recommendations', async (route) => {
    const body = route.request().postDataJSON() as { color?: string; shape?: string };
    bodies.push(body);
    await route.fulfill({
      json: {
        source: 'deepseek',
        recommendations: recs.map((r) => ({
          ...(!body.color ? { color: r.color } : {}),
          ...(!body.shape ? { shape: r.shape } : {}),
          reason: r.reason,
        })),
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '形状 方块', exact: true }).click();
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await expect(page.getByText('本次建议：仅颜色', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(0);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.shape).toBe('square');
  expect(bodies[0]!.color).toBeUndefined();
  expect(bodies[0]!.image).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '自定义 HEX');
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '#123ABC');
  await expect(page.getByText('尚未选择的项目使用临时蓝色 / 圆点预览，也可直接导出。')).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '形状 方块', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('采用推荐 3', { exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '#37533F');
  await expect(page.getByRole('button', { name: '形状 方块', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '重新生成 AI 建议', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(2);
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toBeVisible();
  expect(bodies[1]!.shape).toBe('square');
  expect(bodies[1]!.color).toBeUndefined();
  await page.getByLabel('画面比例').selectOption('1:1');
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '换一种碎片排列' }).click();
  // Wait beyond the former debounce interval to detect accidental automatic requests.
  await page.waitForTimeout(700);
  expect(bodies).toHaveLength(2);
});

test('adopted AI combinations remain available for repeated local comparison', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/recommendations', (route) => {
    calls++;
    return route.fulfill({ json: { source: 'deepseek', recommendations: recs } });
  });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  const candidates = page.getByRole('button', { name: /^采用推荐 [123]$/ });
  const artwork = () =>
    page.getByTestId('artwork').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await expect(candidates).toHaveCount(3);
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '#123ABC');
  await expect(page.getByRole('button', { name: '形状 眼睛', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const firstArtwork = await artwork();
  for (const [index, color, shape] of [
    [2, '#D97755', '圆点'],
    [3, '#37533F', '燕子'],
  ] as const) {
    await page.getByLabel(`采用推荐 ${index}`, { exact: true }).click();
    await expect(candidates).toHaveCount(3);
    await expect(page.getByLabel(`采用推荐 ${index}`, { exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', color);
    await expect(page.getByRole('button', { name: `形状 ${shape}`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(artwork).not.toBe(firstArtwork);
  }
  await mkdir('artifacts/acceptance', { recursive: true });
  await page.screenshot({
    path: 'artifacts/acceptance/recommendation-comparison.png',
    fullPage: true,
  });
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect.poll(artwork).toBe(firstArtwork);
  await expect(page.getByText('已采用', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '换一种碎片排列' }).click();
  await expect(candidates).toHaveCount(3);
  await page.waitForTimeout(700);
  expect(calls).toBe(1);
  // Explicit manual choices end comparison without retaining permission to overwrite them.
  await page.getByRole('button', { name: '底色 #9B242E', exact: true }).click();
  await expect(candidates).toHaveCount(0);
  await expect(page.getByRole('button', { name: '形状 眼睛', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(calls).toBe(1);
});

test('a late AI result cannot overwrite manual changes', async ({ page }) => {
  let release: () => void = () => {};
  let calls = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/recommendations', async (route) => {
    calls++;
    await pending;
    await route.fulfill({ json: { source: 'deepseek', recommendations: recs } }).catch(() => {});
  });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('button', { name: '底色 #9B242E', exact: true }).click();
  await page.getByRole('button', { name: '形状 燕子', exact: true }).click();
  release();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '底色 #9B242E', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '形状 燕子', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(700);
  expect(calls).toBe(1);
});

test('service failure leaves manual editing and built-in fallback usable', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/recommendations', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: '测试推荐服务离线' } });
  });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await expect(page.getByText('测试推荐服务离线')).toBeVisible();
  await page.waitForTimeout(700);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '重试 AI 建议', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByText('测试推荐服务离线')).toBeVisible();
  await page.getByRole('button', { name: '使用内置灵感', exact: true }).click();
  await expect(page.getByText('内置灵感', { exact: true })).toBeVisible();
  await page.getByLabel('采用推荐 2', { exact: true }).click();
  await expect(page.getByRole('button', { name: '导出作品', exact: false })).toBeEnabled();
  await expect(page.getByRole('button', { name: '形状 圆点', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(calls).toBe(2);
});

test('uploads, selections, clearing and built-in inspiration never automatically request AI', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/recommendations', (route) => {
    calls++;
    return route.fulfill({ status: 500, json: { error: '不应调用' } });
  });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await expect(page.getByText('本次建议：颜色 + 形状', { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  expect(calls).toBe(0);

  const color = page.getByRole('button', { name: '底色 #193BCB', exact: true });
  const shape = page.getByRole('button', { name: '形状 眼睛', exact: true });
  await color.click();
  await shape.click();
  await expect(page.getByRole('button', { name: '生成 AI 建议', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '清空颜色和色纸', exact: true }).click();
  await expect(shape).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('本次建议：仅颜色', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清空形状', exact: true }).click();
  await expect(page.getByText('本次建议：颜色 + 形状', { exact: true })).toBeVisible();
  // Clicking an already selected option also clears it.
  await color.click();
  await color.click();
  await shape.click();
  await shape.click();
  await expect(color).toHaveAttribute('aria-pressed', 'false');
  await expect(shape).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('画面比例').selectOption('1:1');
  await page.getByRole('button', { name: '换一种碎片排列' }).click();
  await page
    .getByLabel('上传底图', { exact: true })
    .setInputFiles({ ...file, name: '另一张底图.jpg' });
  await expect(page.getByText('另一张底图.jpg', { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  expect(calls).toBe(0);
  await page.getByRole('button', { name: '使用内置灵感', exact: true }).click();
  await expect(page.getByText('内置灵感', { exact: true })).toBeVisible();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect(color).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('采用推荐 2', { exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '#8A242C');
  await expect(page.getByRole('button', { name: '形状 圆点', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect(color).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(700);
  expect(calls).toBe(0);
});

test('clear both removes uploaded paper and manual generation sends only the photo once', async ({
  page,
}) => {
  const bodies: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/recommendations', async (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await pending;
    await route.fulfill({ json: { source: 'deepseek', recommendations: recs } });
  });
  await manualSetup(page);
  await page
    .getByLabel('上传色纸', { exact: true })
    .setInputFiles({ ...file, name: '待清空色纸.jpg' });
  await expect(page.getByText('待清空色纸.jpg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清空颜色和形状', exact: true }).click();
  await expect(page.getByText('待清空色纸.jpg', { exact: true })).toHaveCount(0);
  await expect(page.getByText('本次建议：颜色 + 形状', { exact: true })).toBeVisible();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '自定义 HEX');
  await expect(page.getByRole('button', { name: '形状 眼睛', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.waitForTimeout(700);
  expect(bodies).toHaveLength(0);
  // Simulate two clicks before React can render the disabled state.
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => bodies.length).toBe(1);
  expect(Object.keys(bodies[0]!)).toEqual(['image']);
  expect(bodies[0]!.image).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.getByRole('button', { name: '正在生成…', exact: true })).toBeDisabled();
  release();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toBeVisible();
  // A changed crop invalidates candidates, but does not authorize another request.
  await page.getByLabel('画面比例').selectOption('1:1');
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(bodies).toHaveLength(1);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', '#123ABC');
  await expect(page.getByRole('button', { name: '形状 眼睛', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(bodies).toHaveLength(2);
});

for (const material of ['color', 'paper'] as const) {
  test(`clearing shape preserves selected ${material} and requests only a shape on click`, async ({
    page,
  }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/recommendations', (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        json: {
          source: 'deepseek',
          recommendations: recs.map(({ shape, reason }) => ({ shape, reason })),
        },
      });
    });
    await manualSetup(page);
    if (material === 'paper') {
      await page
        .getByLabel('上传色纸', { exact: true })
        .setInputFiles({ ...file, name: '保留色纸.jpg' });
      await expect(page.getByText('保留色纸.jpg', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '清空形状', exact: true }).click();
    await expect(page.getByText('本次建议：仅形状', { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    expect(bodies).toHaveLength(0);
    await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
    await page.getByLabel('采用推荐 3', { exact: true }).click();
    await expect(page.getByRole('button', { name: '形状 燕子', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('采用推荐 2', { exact: true }).click();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.shape).toBeUndefined();
    if (material === 'paper') {
      expect(bodies[0]!.paperImage).toMatch(/^data:image\/jpeg;base64,/);
      expect(bodies[0]!.color).toBeUndefined();
      await expect(page.getByText('保留色纸.jpg', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '保留纹理', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } else {
      expect(bodies[0]!.color).toBe('#193BCB');
      expect(bodies[0]!.paperImage).toBeUndefined();
      await expect(page.getByRole('button', { name: '底色 #193BCB', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    await expect(page.getByRole('button', { name: '形状 圆点', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('采用推荐 2', { exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(bodies).toHaveLength(1);
  });
}

test('paper uploads preserve textures and can extract a solid color', async ({ page }) => {
  await manualSetup(page);
  await page
    .getByLabel('上传色纸', { exact: true })
    .setInputFiles({ ...file, name: '纹理色纸.jpg' });
  await expect(page.getByText('纹理色纸.jpg', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保留纹理', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '仅提取底色', exact: true }).click();
  await expect(page.getByLabel('HEX 颜色')).toHaveAttribute('placeholder', /^#[A-F\d]{6}$/);
  await page.getByLabel('导出内容').selectOption('paper');
  await page.getByLabel('导出分辨率').selectOption('1024');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  const metadata = await sharp((await (await download).path())!).metadata();
  expect([metadata.width, metadata.height]).toEqual([768, 1024]);
});

test('mobile controls stay usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await manualSetup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '使用指南' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '开始创作' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await mkdir('artifacts/acceptance', { recursive: true });
  await page.screenshot({ path: 'artifacts/acceptance/mobile.png', fullPage: true });
});

test('all supplied base photos decode with EXIF-aware dimensions and export', async ({ page }) => {
  let files: string[];
  try {
    files = (await readdir('base photos')).filter((name) => name.endsWith('.jpg'));
  } catch {
    files = [];
  }
  test.skip(files.length === 0, 'Private user photos are optional and not committed to CI.');
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByRole('button', { name: '底色 #193BCB', exact: true }).click();
  await page.getByRole('button', { name: '形状 星芒', exact: true }).click();
  await page.getByLabel('导出分辨率').selectOption('1024');
  await mkdir('artifacts/acceptance', { recursive: true });
  for (const [index, name] of files.entries()) {
    const path = resolve('base photos', name);
    const metadata = await sharp(path).metadata();
    const rotated = (metadata.orientation ?? 1) >= 5;
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    await page.getByLabel('上传底图', { exact: true }).setInputFiles(path);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(`${width} × ${height}`, { exact: true })).toBeVisible();
    await expect(page.getByTestId('artwork')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出作品', exact: false }).click();
    const saved = await download;
    await saved.saveAs(`artifacts/acceptance/sample-${index + 1}.png`);
    const exported = await sharp((await saved.path())!).metadata();
    expect(exported.format).toBe('png');
    expect(exported.width).toBeGreaterThan(1000);
  }
  await page.screenshot({ path: 'artifacts/acceptance/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '外围色纸', exact: true }).click();
  await page.getByRole('button', { name: '形状 燕子', exact: true }).click();
  await page.getByRole('button', { name: '环绕排列', exact: true }).click();
  await page.getByTestId('hole-0').press('Shift+ArrowRight');
  await page.getByTestId('fragment-0').press('Shift+ArrowRight');
  const surroundDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  await (await surroundDownload).saveAs('artifacts/acceptance/sample-surround.png');
  await expect(page.getByText('实时预览已更新', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/acceptance/surround-photo-studio.png', fullPage: true });
});
