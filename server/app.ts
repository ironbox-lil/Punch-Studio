import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { recommendationRequestSchema, type Sample } from '../shared/contracts';
import { ServiceError, type Recommender } from './recommendations';
import type { LlmSettings } from './llm-settings';
import { saveLlmConfigSchema } from '../shared/llm-config';

export interface AppOptions {
  recommend: Recommender;
  sampleDir: string;
  configured: boolean;
  production?: boolean;
  llmSettings?: LlmSettings;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: {
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              upgradeInsecureRequests: null,
            },
          }
        : false,
      strictTransportSecurity: false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      recommendationsConfigured:
        options.llmSettings?.publicConfig().configured ?? options.configured,
    }),
  );
  app.use(['/api/recommendations', '/api/llm-config'], (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) {
      res.status(403).json({ error: '请求来源不匹配。' });
      return;
    }
    next();
  });
  app.use('/api/llm-config', (req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
      res.status(403).json({ error: 'LLM 配置仅允许在运行服务的本机访问。' });
      return;
    }
    if (!options.llmSettings) {
      res.status(503).json({ error: '此服务未启用可编辑的 LLM 配置。' });
      return;
    }
    next();
  });
  app.get('/api/llm-config', (_req, res) => res.json(options.llmSettings!.publicConfig()));
  app.put('/api/llm-config', express.json({ limit: '8kb' }), async (req, res) => {
    const parsed = saveLlmConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: '配置无效，请检查服务类型、API 根地址、模型名和密钥。' });
      return;
    }
    res.json(await options.llmSettings!.save(parsed.data));
  });
  app.post(
    '/api/recommendations',
    rateLimit({
      windowMs: 60_000,
      limit: 8,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: '请求过于频繁，请稍后重试。' },
    }),
    express.json({ limit: '6mb' }),
    async (req, res) => {
      const parsed = recommendationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: '请提供有效的图片，并保留至少一项待推荐的设置。' });
        return;
      }
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      const result = await options.recommend(parsed.data, controller.signal);
      if (!res.destroyed) res.json(result);
    },
  );
  // Local fixtures are optional and never copied into the public build.
  const sampleNames = async () => {
    try {
      return (await readdir(options.sampleDir))
        .filter((name) => /^[\w-]+\.(jpg|jpeg|png|webp)$/i.test(name))
        .sort();
    } catch {
      return [];
    }
  };
  app.get('/api/samples', async (_req, res) => {
    const names = await sampleNames();
    const samples: Sample[] = names.map((name, index) => ({
      id: name,
      name: `样片 ${String(index + 1).padStart(2, '0')}`,
      url: `/api/samples/${name}`,
      thumbnail: `/api/samples/${name}?thumbnail=1`,
    }));
    res.json(samples);
  });
  app.get('/api/samples/:name', async (req, res) => {
    const name = req.params.name;
    if (!(await sampleNames()).includes(name)) {
      res.status(404).json({ error: '找不到该样片。' });
      return;
    }
    if (req.query.thumbnail === '1') {
      const image = await sharp(join(options.sampleDir, name))
        .rotate()
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 75 })
        .toBuffer();
      res.type('jpeg').send(image);
    } else res.sendFile(join(options.sampleDir, name));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ServiceError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: '请求格式不正确。' });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ error: '图片请求过大，请降低图片分辨率。' });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ error: '处理遇到问题，请重试。' });
  };
  app.use(errors);
  return app;
}
