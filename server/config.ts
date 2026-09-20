import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { providerSchema } from '../shared/llm-config';

dotenv({ path: '.env.local', quiet: true });
export const config = {
  provider: providerSchema.parse(process.env.LLM_PROVIDER ?? 'deepseek'),
  apiKey: process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? '',
  model: process.env.LLM_MODEL ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
  baseUrl: process.env.LLM_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  settingsFile: resolve(process.env.LLM_CONFIG_FILE ?? '.local/llm.json'),
  port: Number(process.env.PORT ?? 5173),
  host: process.env.HOST ?? '127.0.0.1',
  sampleDir: resolve(process.env.SAMPLE_DIR ?? 'base photos'),
  production: process.env.NODE_ENV === 'production' || process.argv[1]?.includes('dist-server'),
};
