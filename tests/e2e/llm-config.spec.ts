import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { PublicLlmConfig, SaveLlmConfig } from '../../shared/llm-config';

async function settingsApi(page: Page, configured = true) {
  let config: PublicLlmConfig = {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    configured,
    source: 'environment',
    revision: randomUUID(),
  };
  const saves: SaveLlmConfig[] = [];
  let modelCalls = 0;
  await page.route('**/api/recommendations', (route) => {
    modelCalls++;
    return route.fulfill({
      json: {
        source: 'compatible',
        recommendations: Array.from({ length: 3 }, () => ({
          color: '#123456',
          shape: 'circle',
          reason: '模拟视觉建议',
        })),
      },
    });
  });
  // Never modify a developer's real configuration or send a billable request in UI tests.
  await page.route('**/api/llm-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as SaveLlmConfig;
      saves.push(body);
      config = {
        provider: body.provider,
        baseUrl: body.baseUrl,
        model: body.model,
        configured: body.keyAction === 'keep' ? config.configured : body.keyAction === 'replace',
        source: 'local',
        revision: randomUUID(),
      };
    }
    await route.fulfill({ json: config });
  });
  return { saves, calls: () => modelCalls };
}

test('LLM settings save, retain and clear keys without displaying or storing secrets in the browser', async ({
  page,
}) => {
  const api = await settingsApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'LLM 配置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'LLM 配置', exact: true });
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'password');
  await dialog.getByLabel('服务类型').selectOption('compatible');
  await dialog.getByLabel('API 根地址').fill('https://vision.example/v1');
  await dialog.getByLabel('模型名称').fill('my-vision');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('重新填写');
  expect(api.saves).toHaveLength(0);
  await dialog.getByLabel('API Key', { exact: true }).fill('test-personal-credential');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('配置已保存');
  expect(api.saves).toHaveLength(1);
  expect(api.saves[0]).toMatchObject({
    provider: 'compatible',
    baseUrl: 'https://vision.example/v1',
    model: 'my-vision',
    keyAction: 'replace',
    apiKey: 'test-personal-credential',
  });
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  expect(await dialog.innerText()).not.toContain('test-personal-credential');
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'test-personal-credential',
  );
  await dialog.getByRole('button', { name: '关闭 LLM 配置' }).click();
  await page.getByRole('button', { name: 'LLM 配置', exact: true }).click();
  await expect(dialog.getByLabel('模型名称')).toHaveValue('my-vision');
  await dialog.getByLabel('模型名称').fill('another-vision');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('配置已保存');
  expect(api.saves[1]!.keyAction).toBe('keep');
  expect(api.saves[1]!.apiKey).toBeUndefined();
  await dialog.getByRole('button', { name: '清除已保存密钥' }).click();
  await expect(dialog.getByRole('status')).toContainText('密钥已清除');
  expect(api.saves[2]!.keyAction).toBe('clear');
  await expect(dialog.getByRole('button', { name: '清除已保存密钥' })).toBeDisabled();
  expect(api.calls()).toBe(0);
});

test('mobile configuration reports save failure and discards unsaved credentials on close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await settingsApi(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'LLM 配置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'LLM 配置', exact: true });
  await dialog.getByLabel('API Key', { exact: true }).fill('test-unsaved-credential');
  await page.route('**/api/llm-config', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: '配置保存失败，请重试。' } })
      : route.fallback(),
  );
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('配置保存失败');
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/acceptance/llm-config-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'LLM 配置', exact: true }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  expect(api.saves).toHaveLength(0);
  expect(api.calls()).toBe(0);
});

test('saving model configuration retains completed suggestions and editing state without another call', async ({
  page,
}) => {
  const api = await settingsApi(page);
  const image = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#b47554' },
  })
    .png()
    .toBuffer();
  await page.goto('/');
  await page
    .getByLabel('上传底图', { exact: true })
    .setInputFiles({ name: 'settings-test.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await page.getByLabel('采用推荐 1', { exact: true }).click();
  await page.getByTestId('fragment-0').press('ArrowRight');
  const target = await page.getByTestId('fragment-0').getAttribute('transform');
  await page.getByRole('button', { name: '配置模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'LLM 配置', exact: true });
  await dialog.getByLabel('模型名称').fill('another-vision');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('配置已保存');
  await page.screenshot({ path: 'artifacts/acceptance/llm-config-desktop.png', fullPage: true });
  await dialog.getByRole('button', { name: '关闭 LLM 配置' }).click();
  await expect(page.getByRole('button', { name: /^采用推荐 [123]$/ })).toHaveCount(3);
  await expect(page.getByTestId('fragment-0')).toHaveAttribute('transform', target!);
  expect(api.calls()).toBe(1);
});
