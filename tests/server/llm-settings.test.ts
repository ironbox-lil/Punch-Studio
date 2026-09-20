import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { loadLlmSettings } from '../../server/llm-settings';
import { createApp } from '../../server/app';
import { saveLlmConfigSchema, type SaveLlmConfig } from '../../shared/llm-config';

const directories: string[] = [];
const defaults = {
  apiKey: 'test-environment-credential',
  model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com',
};
const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#999' } })
  .png()
  .toBuffer();
const image = `data:image/png;base64,${png.toString('base64')}`;
const response = () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              recommendations: Array.from({ length: 3 }, () => ({
                color: '#123456',
                shape: 'circle',
                reason: '测试',
              })),
            }),
          },
        },
      ],
    }),
  );
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'punch-settings-'));
  directories.push(directory);
  const file = join(directory, 'private', 'llm.json');
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const settings = await loadLlmSettings(file, defaults, fetcher);
  const update = (changes: Partial<SaveLlmConfig> = {}): SaveLlmConfig => ({
    provider: 'deepseek',
    baseUrl: defaults.baseUrl,
    model: defaults.model,
    revision: settings.publicConfig().revision,
    keyAction: 'keep',
    ...changes,
  });
  return { directory, file, fetcher, settings, update };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('local LLM configuration', () => {
  it('persists privately without calling the provider or returning a key, and supports keeping and clearing it', async () => {
    const { file, settings, update, fetcher } = await setup();
    const saved = await settings.save(
      update({ keyAction: 'replace', apiKey: 'test-personal-credential' }),
    );
    expect(saved.configured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('credential');
    expect('apiKey' in saved).toBe(false);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await settings.save(update({ model: 'another-vision-model' }));
    expect(JSON.parse(await readFile(file, 'utf8')).apiKey).toBe('test-personal-credential');
    const restored = await loadLlmSettings(file, defaults, fetcher);
    expect(restored.publicConfig()).toEqual(settings.publicConfig());
    await settings.save(update({ keyAction: 'clear' }));
    const cleared = await loadLlmSettings(file, defaults, fetcher);
    expect(cleared.publicConfig().configured).toBe(false);
    await expect(cleared.recommend({ image })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the selected provider and key on the next request with separate caches and no vendor-only fields', async () => {
    const { settings, update, fetcher } = await setup();
    await settings.recommend({ image });
    await settings.recommend({ image });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await settings.save(
      update({
        provider: 'compatible',
        baseUrl: 'https://vision.example/v1',
        model: 'my-vision',
        keyAction: 'replace',
        apiKey: 'test-new-provider-key',
      }),
    );
    const result = await settings.recommend({ image });
    expect(result.source).toBe('compatible');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe('https://vision.example/v1/chat/completions');
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer test-new-provider-key' });
    expect(init!.redirect).toBe('error');
    const payload = JSON.parse(init!.body as string);
    expect(payload.model).toBe('my-vision');
    expect(payload.thinking).toBeUndefined();
    expect(payload.messages[0].content[1].type).toBe('image_url');
  });

  it('does not retarget saved credentials or overwrite a newer revision', async () => {
    const { settings, update } = await setup();
    await expect(
      settings.save(update({ baseUrl: 'https://different.example/v1' })),
    ).rejects.toMatchObject({ status: 422 });
    const stale = update();
    await settings.save(update({ model: 'new-model' }));
    await expect(settings.save(stale)).rejects.toMatchObject({ status: 409 });
    expect(settings.publicConfig().model).toBe('new-model');
  });

  it('rejects unsafe or credential-bearing URLs, malformed key actions and invalid local files', async () => {
    const { file, settings, update } = await setup();
    for (const baseUrl of [
      'http://remote.example',
      'https://name:secret@example.com',
      'https://example.com?api_key=secret',
      'https://example.com#key',
      'file:///tmp',
      'https://example.com/v1/chat/completions',
    ])
      expect(saveLlmConfigSchema.safeParse(update({ baseUrl })).success).toBe(false);
    expect(
      saveLlmConfigSchema.safeParse(update({ baseUrl: 'http://127.0.0.1:1234/v1' })).success,
    ).toBe(true);
    expect(saveLlmConfigSchema.safeParse(update({ keyAction: 'replace' })).success).toBe(false);
    await settings.save(update());
    await writeFile(file, '{broken-secret-file');
    await expect(loadLlmSettings(file, defaults)).rejects.toThrow('本地 LLM 配置无法读取');
  });

  it('keeps the active configuration if writing fails', async () => {
    const { directory, fetcher } = await setup();
    const blocker = join(directory, 'not-a-directory');
    const settings = await loadLlmSettings(join(blocker, 'llm.json'), defaults, fetcher);
    await writeFile(blocker, 'block writes');
    const previous = settings.publicConfig();
    await expect(settings.save({ ...previous, keyAction: 'clear' })).rejects.toMatchObject({
      status: 500,
    });
    expect(settings.publicConfig()).toEqual(previous);
  });

  it('exposes only redacted metadata over HTTP and guards writes and health state', async () => {
    const { settings, update, fetcher } = await setup();
    const app = createApp({
      recommend: settings.recommend,
      llmSettings: settings,
      configured: true,
      sampleDir: '/absent-fixtures',
    });
    const initial = await request(app).get('/api/llm-config');
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.text).not.toContain(defaults.apiKey);
    expect(
      (
        await request(app)
          .put('/api/llm-config')
          .set('Origin', 'https://unrelated.example')
          .send(update())
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put('/api/llm-config')
          .send({ ...update(), unexpected: 'secret' })
      ).status,
    ).toBe(422);
    const saved = await request(app)
      .put('/api/llm-config')
      .send(update({ keyAction: 'clear' }));
    expect(saved.status).toBe(200);
    expect(saved.body.configured).toBe(false);
    expect((await request(app).get('/api/health')).body.recommendationsConfigured).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
