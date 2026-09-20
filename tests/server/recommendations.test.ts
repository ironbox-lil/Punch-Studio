import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../server/app';
import { createRecommender, ServiceError } from '../../server/recommendations';
import { recommendationRequestSchema, type RecommendationRequest } from '../../shared/contracts';

const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#7733ff' } })
  .png()
  .toBuffer();
const image = `data:image/png;base64,${png.toString('base64')}`;
const provider = {
  apiKey: 'test-key-never-live',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
};
const options = Array.from({ length: 3 }, (_, i) => ({
  color: '#CC4422',
  shape: 'eye',
  reason: `对比与留白 ${i}`,
}));
const reply = (data: unknown, finish = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content: JSON.stringify(data) } }],
    }),
    { status: 200 },
  );

describe('recommendation boundary', () => {
  it('accepts precisely the three missing-field branches', () => {
    expect(recommendationRequestSchema.safeParse({ image }).success).toBe(true);
    expect(recommendationRequestSchema.safeParse({ image, shape: 'eye' }).success).toBe(true);
    expect(recommendationRequestSchema.safeParse({ image, color: '#ffffff' }).success).toBe(true);
    expect(recommendationRequestSchema.safeParse({ image, paperImage: image }).success).toBe(true);
    expect(
      recommendationRequestSchema.safeParse({ image, color: '#ffffff', shape: 'eye' }).success,
    ).toBe(false);
    expect(recommendationRequestSchema.safeParse({ image, shape: 'new-ai-shape' }).success).toBe(
      false,
    );
  });
  it.each([
    [{ image }, true, true],
    [{ image, shape: 'circle' }, true, false],
    [{ image, color: '#ABCDEF' }, false, true],
    [{ image, paperImage: image }, false, true],
  ] as [RecommendationRequest, boolean, boolean][])(
    'only returns missing fields for %j',
    async (input, color, shape) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ recommendations: options }));
      const result = await createRecommender(provider, fetcher)(input);
      expect(result.recommendations).toHaveLength(3);
      expect('color' in result.recommendations[0]!).toBe(color);
      expect('shape' in result.recommendations[0]!).toBe(shape);
      const payload = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(payload.model).toBe('deepseek-flash');
      expect(payload.messages[0].content[1].type).toBe('image_url');
    },
  );
  it('rejects invented shapes, incomplete data and truncated responses', async () => {
    for (const data of [
      { recommendations: options.map((o) => ({ ...o, shape: 'invented' })) },
      { recommendations: options.slice(0, 2) },
      { recommendations: options.map((o) => ({ reason: o.reason })) },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(data));
      await expect(createRecommender(provider, fetcher)({ image })).rejects.toMatchObject({
        status: 502,
      });
    }
    await expect(
      createRecommender(
        provider,
        vi.fn<typeof fetch>().mockResolvedValue(reply({ recommendations: options }, 'length')),
      )({ image }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('caches identical inputs and never accepts a fake image', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ recommendations: options }));
    const recommend = createRecommender(provider, fetcher);
    await recommend({ image });
    await recommend({ image });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      recommend({ image: 'data:image/png;base64,bm90IGFuIGltYWdl' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('does not reveal provider credentials or error bodies', async () => {
    const recommend = createRecommender(
      provider,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('test-key-never-live', { status: 401 })),
    );
    await expect(recommend({ image })).rejects.toThrow('推荐服务暂时不可用');
  });
});

describe('HTTP API', () => {
  const recommend = vi.fn().mockRejectedValue(new ServiceError(503, '服务未配置'));
  const app = createApp({
    recommend,
    sampleDir: '/non-existent-punch-fixtures',
    configured: false,
  });
  it('reports capability without exposing credentials', async () => {
    const result = await request(app).get('/api/health');
    expect(result.body).toEqual({ status: 'ok', recommendationsConfigured: false });
  });
  it('blocks complete configurations before invoking a paid provider', async () => {
    recommend.mockClear();
    const result = await request(app)
      .post('/api/recommendations')
      .send({ image, shape: 'circle', color: '#ffffff' });
    expect(result.status).toBe(422);
    expect(recommend).not.toHaveBeenCalled();
  });
  it('rejects cross-origin calls and malformed JSON', async () => {
    expect(
      (
        await request(app)
          .post('/api/recommendations')
          .set('Origin', 'https://unrelated.example')
          .send({ image })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/recommendations')
          .set('Content-Type', 'application/json')
          .send('{')
      ).status,
    ).toBe(400);
  });
  it('works without local photos and prevents arbitrary file reads', async () => {
    expect((await request(app).get('/api/samples')).body).toEqual([]);
    expect((await request(app).get('/api/samples/.env.local')).status).toBe(404);
  });
});
