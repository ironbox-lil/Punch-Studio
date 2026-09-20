import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { llmFieldsSchema, type PublicLlmConfig, type SaveLlmConfig } from '../shared/llm-config';
import { z } from 'zod';
import {
  createRecommender,
  ServiceError,
  type ProviderConfig,
  type Recommender,
} from './recommendations';

const storedSchema = llmFieldsSchema
  .extend({
    apiKey: z
      .string()
      .max(512)
      .regex(/^[\x21-\x7e]*$/),
    revision: z.string().uuid(),
  })
  .strict();

export interface LlmSettings {
  publicConfig: () => PublicLlmConfig;
  save: (update: SaveLlmConfig) => Promise<PublicLlmConfig>;
  recommend: Recommender;
}

export async function loadLlmSettings(
  file: string,
  defaults: ProviderConfig,
  fetcher: typeof fetch = fetch,
): Promise<LlmSettings> {
  let config = storedSchema.parse({
    provider: defaults.provider ?? 'deepseek',
    apiKey: defaults.apiKey,
    baseUrl: defaults.baseUrl,
    model: defaults.model,
    revision: randomUUID(),
  });
  let source: PublicLlmConfig['source'] = 'environment';
  try {
    config = storedSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    source = 'local';
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      // Never echo a malformed file or silently fall back to a different billable credential.
      // eslint-disable-next-line preserve-caught-error -- Parser failures may contain credentials.
      throw new Error('本地 LLM 配置无法读取，请修复或移走 .local/llm.json 后重启。');
    }
  }
  let recommend = createRecommender(config, fetcher);
  let saving = false;
  const publicConfig = (): PublicLlmConfig => ({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    configured: !!config.apiKey,
    source,
    revision: config.revision,
  });
  return {
    publicConfig,
    recommend: (request, signal) => recommend(request, signal),
    async save(update) {
      if (saving || update.revision !== config.revision)
        throw new ServiceError(409, '配置已更新，请关闭后重新打开配置窗口。');
      if (update.keyAction === 'keep' && config.apiKey && update.baseUrl !== config.baseUrl)
        throw new ServiceError(422, '更换 API 地址时，请重新填写对应服务的 API Key。');
      saving = true;
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        const next = storedSchema.parse({
          provider: update.provider,
          baseUrl: update.baseUrl,
          model: update.model,
          apiKey:
            update.keyAction === 'replace'
              ? update.apiKey
              : update.keyAction === 'clear'
                ? ''
                : config.apiKey,
          revision: randomUUID(),
        });
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
          mode: 0o600,
          flag: 'wx',
        });
        await chmod(temporary, 0o600);
        await rename(temporary, file);
        config = next;
        source = 'local';
        // Each configuration gets its own cache. Old provider results cannot serve a new configuration.
        recommend = createRecommender(config, fetcher);
        return publicConfig();
      } catch {
        throw new ServiceError(500, '配置保存失败，请检查本地数据目录的写入权限。');
      } finally {
        saving = false;
        await rm(temporary, { force: true }).catch(() => {});
      }
    },
  };
}
