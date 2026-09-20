import express from 'express';
import { resolve } from 'node:path';
import { config } from './config';
import { createApp } from './app';
import { loadLlmSettings } from './llm-settings';

const llmSettings = await loadLlmSettings(config.settingsFile, config);
const app = createApp({
  recommend: llmSettings.recommend,
  sampleDir: config.sampleDir,
  configured: !!config.apiKey,
  production: config.production,
  llmSettings,
});
if (config.production) {
  app.use(express.static(resolve('dist'), { index: false, dotfiles: 'deny' }));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(config.port, config.host, () =>
  console.log(`Punch Studio ready at http://${config.host}:${config.port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
