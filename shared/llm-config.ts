import { z } from 'zod';

export const providerSchema = z.enum(['deepseek', 'compatible']);
export const baseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /\/chat\/completions\/?$/.test(url.pathname)
      )
        throw new Error('invalid');
    } catch {
      context.addIssue({
        code: 'custom',
        message: '请输入 HTTPS API 根地址（本机服务可用 HTTP），不要包含密钥或 /chat/completions。',
      });
    }
  })
  .transform((value) => value.replace(/\/+$/, ''));
export const llmFieldsSchema = z.object({
  provider: providerSchema,
  baseUrl: baseUrlSchema,
  model: z
    .string()
    .trim()
    .min(1, '请输入具备图像能力的模型名。')
    .max(160)
    .refine(
      (value) =>
        !/\s/.test(value) &&
        [...value].every((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127),
    ),
});
export const publicLlmConfigSchema = llmFieldsSchema.extend({
  configured: z.boolean(),
  source: z.enum(['environment', 'local']),
  revision: z.string().uuid(),
});
export const saveLlmConfigSchema = llmFieldsSchema
  .extend({
    revision: z.string().uuid(),
    keyAction: z.enum(['keep', 'replace', 'clear']),
    apiKey: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) => (value.keyAction === 'replace' ? !!value.apiKey : value.apiKey === undefined),
    {
      message: '请重新填写 API Key，或明确选择保留/清除。',
    },
  );
export type LlmFields = z.infer<typeof llmFieldsSchema>;
export type PublicLlmConfig = z.infer<typeof publicLlmConfigSchema>;
export type SaveLlmConfig = z.infer<typeof saveLlmConfigSchema>;
