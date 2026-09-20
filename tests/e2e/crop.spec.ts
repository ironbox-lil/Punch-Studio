import { test, expect, type Page, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const source = await sharp(
  Buffer.from(
    '<svg width="800" height="600"><rect width="400" height="600" fill="#ff0000"/><rect x="400" width="400" height="600" fill="#00ff00"/></svg>',
  ),
)
  .png()
  .toBuffer();
const file = { name: '左右红绿底图.png', mimeType: 'image/png', buffer: source };
const recommendations = [
  { color: '#123ABC', shape: 'swallow', reason: '燕子与深蓝色纸。' },
  { color: '#D97755', shape: 'circle', reason: '圆点与暖色纸。' },
  { color: '#37533F', shape: 'square', reason: '方块与绿色纸。' },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/recommendations', (route) =>
    route.fulfill({ status: 503, json: { error: '测试禁止真实模型调用' } }),
  );
});

async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2,
    y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test('cropping shares the selected pixels with preview, AI and original-resolution export', async ({
  page,
}) => {
  const requests: { image: string }[] = [];
  await page.route('**/api/recommendations', (route) => {
    requests.push(route.request().postDataJSON() as { image: string });
    return route.fulfill({ json: { source: 'deepseek', recommendations } });
  });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  const before = await page
    .getByTestId('artwork')
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: '自由裁剪底图', exact: true }).click();
  await page.getByLabel('裁剪比例', { exact: true }).selectOption('1:1');
  await page.getByRole('slider', { name: '裁剪缩放', exact: true }).press('End');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page.getByTestId('artwork').evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
  ).toBe(before);
  expect(requests).toHaveLength(1);

  await page.getByRole('button', { name: '自由裁剪底图', exact: true }).click();
  await page.getByLabel('裁剪比例', { exact: true }).selectOption('1:1');
  await page.getByRole('slider', { name: '裁剪缩放', exact: true }).press('End');
  await expect(page.getByText('75 × 75 px', { exact: true })).toBeVisible();
  const stage = await page.getByTestId('crop-stage').boundingBox();
  await dragBy(page, page.getByTestId('crop-selection'), stage!.width * 0.3, 0);
  await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('上下双联 · 1:1', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId('artwork').evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        return Array.from(
          canvas.getContext('2d')!.getImageData(2, canvas.height / 2 + 2, 1, 1).data,
        );
      }),
    )
    .toEqual([0, 255, 0, 255]);
  await page.waitForTimeout(700);
  expect(requests).toHaveLength(1);

  await page.getByRole('button', { name: '清空颜色和形状', exact: true }).click();
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await expect(page.getByLabel('采用推荐 1', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  const aiPreview = await sharp(Buffer.from(requests[1]!.image.split(',')[1]!, 'base64'))
    .raw()
    .toBuffer();
  expect(aiPreview[0]).toBeLessThan(5);
  expect(aiPreview[1]).toBeGreaterThan(250);
  expect(aiPreview[2]).toBeLessThan(5);
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await page.getByLabel('导出内容').selectOption('photo');
  await page.getByLabel('导出分辨率').selectOption('original');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出作品', exact: false }).click();
  const output = (await (await download).path())!;
  const metadata = await sharp(output).metadata();
  expect([metadata.width, metadata.height]).toEqual([75, 75]);
  const pixel = await sharp(output)
    .extract({ left: 1, top: 1, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel]).toEqual([0, 255, 0]);

  await page.getByRole('button', { name: '调整底图裁剪', exact: true }).click();
  await expect(page.getByText('75 × 75 px', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置裁剪', exact: true }).click();
  await expect(page.getByText('800 × 600 px', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
  await expect(page.getByLabel('画面比例', { exact: true })).toHaveValue('auto');
  expect(requests).toHaveLength(2);
});

test('free edge and corner resizing, keyboard movement and source replacement remain nondestructive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '自由裁剪底图', exact: true }).click();
  await page.getByLabel('裁剪比例', { exact: true }).selectOption('free');
  const stage = await page.getByTestId('crop-stage').boundingBox();
  await dragBy(
    page,
    page.getByRole('button', { name: '调整裁剪框右边', exact: true }),
    -stage!.width * 0.35,
    0,
  );
  await dragBy(
    page,
    page.getByRole('button', { name: '调整裁剪框右下角', exact: true }),
    -stage!.width * 0.1,
    -stage!.height * 0.1,
  );
  const selection = page.getByTestId('crop-selection');
  const initial = await selection.boundingBox();
  expect(initial!.width / initial!.height).toBeLessThan(0.9);
  await selection.focus();
  await selection.press('Shift+ArrowRight');
  const moved = await selection.boundingBox();
  expect(moved!.x - initial!.x).toBeCloseTo((stage!.width * 10) / 800, 0);
  await mkdir('artifacts/acceptance', { recursive: true });
  await page.screenshot({ path: 'artifacts/acceptance/free-crop-desktop.png' });
  await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
  await expect(page.getByLabel('画面比例', { exact: true })).toHaveValue('free');
  await expect(page.getByText('左右双联 · 自由裁剪', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '调整底图裁剪', exact: true }).click();
  await page.getByLabel('裁剪比例', { exact: true }).selectOption('16:9');
  await dragBy(page, page.getByRole('button', { name: '调整裁剪框右下角', exact: true }), -40, 25);
  const locked = await selection.boundingBox();
  expect(locked!.width / locked!.height).toBeCloseTo(16 / 9, 1);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('画面比例', { exact: true })).toHaveValue('free');
  await page
    .getByLabel('上传底图', { exact: true })
    .setInputFiles({ ...file, name: '新的底图.png' });
  await page.getByRole('button', { name: '自由裁剪底图', exact: true }).click();
  await expect(page.getByText('800 × 600 px', { exact: true })).toBeVisible();
});

test('mobile crop controls and confirmation remain reachable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('上传底图', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '自由裁剪底图', exact: true }).click();
  await page.getByLabel('裁剪比例', { exact: true }).selectOption('3:4');
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const selection = page.getByTestId('crop-selection');
  const bounds = (await selection.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 30, y }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await selection.boundingBox())!.x - bounds.x).toBeCloseTo(30, 0);
  await touch.detach();
  await mkdir('artifacts/acceptance', { recursive: true });
  await page.screenshot({ path: 'artifacts/acceptance/free-crop-mobile.png' });
  await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
  await expect(page.getByText('左右双联 · 3:4', { exact: true })).toBeVisible();
});
