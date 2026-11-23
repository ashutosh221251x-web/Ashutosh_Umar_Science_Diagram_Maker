import { z } from 'zod';

export interface ConceptSpec {
  id: string;
  number: string;
  name: string;
  subject: string;
  prompt: string;
}

/** Mirror src/concepts.js exactly - specification constants, not demo data */
export const CONCEPTS: ConceptSpec[] = [
  {
    id: 'pythagoras',
    number: '01',
    name: "Pythagoras’ theorem",
    subject: 'Maths',
    prompt: 'In a right-angled triangle, the longest side is called the hypotenuse. The square of the hypotenuse is equal to the sum of the squares of the other two sides: a² + b² = c².'
  },
  {
    id: 'circle',
    number: '02',
    name: 'Parts of a circle',
    subject: 'Maths',
    prompt: 'A circle has a centre. The radius is the distance from the centre to the edge. The diameter goes across the circle through the centre and is twice the radius. The circumference is the distance around the circle.'
  },
  {
    id: 'series',
    number: '03',
    name: 'Series circuit',
    subject: 'Physics',
    prompt: 'In a series circuit there is only one loop. The current is the same everywhere in the loop. The voltage of the cell is shared between the components.'
  },
  {
    id: 'photosynthesis',
    number: '04',
    name: 'Photosynthesis',
    subject: 'Biology',
    prompt: 'Plants take in carbon dioxide and water. They use light energy, absorbed by chlorophyll, to make glucose and oxygen.'
  },
  {
    id: 'matter',
    number: '05',
    name: 'States of matter',
    subject: 'Chemistry',
    prompt: 'In a solid the particles are close together and vibrate in place. In a liquid they are close but move past each other. In a gas they are far apart and move fast.'
  }
];

export const CONCEPT_IDS = ['pythagoras', 'circle', 'series', 'photosynthesis', 'matter'] as const;
export type ConceptId = typeof CONCEPT_IDS[number];
export const CONCEPT_MAP = new Map<string, ConceptSpec>(CONCEPTS.map(c => [c.id, c]));

export const CHECK_IDS = ['svg_parse', 'bounds', 'labels', 'animation', 'safety'] as const;
export type CheckId = typeof CHECK_IDS[number];

export const CheckResultSchema = z.object({
  passed: z.boolean(),
  reason: z.string()
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const ChecksMapSchema = z.object({
  svg_parse: CheckResultSchema,
  bounds: CheckResultSchema,
  labels: CheckResultSchema,
  animation: CheckResultSchema,
  safety: CheckResultSchema
});
export type ChecksMap = z.infer<typeof ChecksMapSchema>;

export const UsageSchema = z.object({
  model: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable()
});
export type Usage = z.infer<typeof UsageSchema>;

export const DiagramResultSchema = z.object({
  id: z.enum(CONCEPT_IDS),
  svg: z.string().nullable(),
  checks: ChecksMapSchema,
  usage: UsageSchema,
  retryCount: z.number().int().nonnegative(),
  validationRetryCount: z.number().int().nonnegative(),
  apiRetryCount: z.number().int().nonnegative(),
  generatedAt: z.string(),
  error: z.string().nullable()
});
export type DiagramResult = z.infer<typeof DiagramResultSchema>;

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewSchema = z.object({
  conceptId: z.enum(CONCEPT_IDS),
  status: ReviewStatusSchema,
  note: z.string().max(1000),
  updatedAt: z.string()
});
export type Review = z.infer<typeof ReviewSchema>;

export const GenerateRequestSchema = z.object({
  conceptId: z.enum(CONCEPT_IDS)
});

export const ReviewUpdateRequestSchema = z.object({
  status: ReviewStatusSchema,
  note: z.string().max(1000)
});
