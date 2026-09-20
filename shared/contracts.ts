import { z } from 'zod';

export const SHAPE_IDS = [
  'circle',
  'square',
  'teardrop',
  'starburst',
  'cross',
  'eye',
  'swallow',
  'puzzle',
] as const;
export const shapeSchema = z.enum(SHAPE_IDS);
export type ShapeId = z.infer<typeof shapeSchema>;
export const colorSchema = z.string().regex(/^#[\da-f]{6}$/i);
const imageSchema = z
  .string()
  .max(2_800_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/);

export const recommendationRequestSchema = z
  .object({
    image: imageSchema,
    paperImage: imageSchema.optional(),
    color: colorSchema.optional(),
    shape: shapeSchema.optional(),
  })
  .strict()
  .refine((value) => !(value.shape && (value.color || value.paperImage)), {
    message: '色纸和形状已齐全，无需推荐',
  });
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const recommendationSchema = z.object({
  color: colorSchema.optional(),
  shape: shapeSchema.optional(),
  reason: z.string().trim().min(1).max(180),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export const recommendationResponseSchema = z.object({
  source: z.enum(['deepseek', 'compatible']),
  recommendations: z.array(recommendationSchema).length(3),
});
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
export interface Sample {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
}
