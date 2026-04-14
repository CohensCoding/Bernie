import { z } from 'zod';

export const ExtractedFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    evidence: z.array(z.string()).nullable().optional(),
  });

export type ExtractedField<T> = {
  value: T | null;
  confidence?: number | null;
  evidence?: string[] | null;
};

export const ExtractionPayloadSchema = z.object({
  title_raw: ExtractedFieldSchema(z.string()),
  player_name: ExtractedFieldSchema(z.string()),
  sport: ExtractedFieldSchema(z.string()),
  team: ExtractedFieldSchema(z.string()),
  year: ExtractedFieldSchema(z.number().int()),
  brand: ExtractedFieldSchema(z.string()),
  set_name: ExtractedFieldSchema(z.string()),
  subset: ExtractedFieldSchema(z.string()),
  card_number: ExtractedFieldSchema(z.string()),
  parallel: ExtractedFieldSchema(z.string()),
  serial_number: ExtractedFieldSchema(z.number().int()),
  print_run: ExtractedFieldSchema(z.number().int()),
  rookie: ExtractedFieldSchema(z.boolean()),
  auto: ExtractedFieldSchema(z.boolean()),
  patch: ExtractedFieldSchema(z.boolean()),
  graded: ExtractedFieldSchema(z.boolean()),
  grading_company: ExtractedFieldSchema(z.string()),
  grade: ExtractedFieldSchema(z.string()),
  purchase_price: ExtractedFieldSchema(z.number()),
  taxes: ExtractedFieldSchema(z.number()),
  shipping: ExtractedFieldSchema(z.number()),
  total_cost: ExtractedFieldSchema(z.number()),
  purchase_date: ExtractedFieldSchema(z.string()),
  platform: ExtractedFieldSchema(z.string()),
  source_url: ExtractedFieldSchema(z.string()),
  notes: ExtractedFieldSchema(z.string()),
});

export type ExtractionPayload = z.infer<typeof ExtractionPayloadSchema>;

export function emptyExtractionPayload(): ExtractionPayload {
  const field = <T,>(value: T | null): ExtractedField<T> => ({ value, confidence: null, evidence: null });
  return {
    title_raw: field<string>(null),
    player_name: field<string>(null),
    sport: field<string>(null),
    team: field<string>(null),
    year: field<number>(null),
    brand: field<string>(null),
    set_name: field<string>(null),
    subset: field<string>(null),
    card_number: field<string>(null),
    parallel: field<string>(null),
    serial_number: field<number>(null),
    print_run: field<number>(null),
    rookie: field<boolean>(null),
    auto: field<boolean>(null),
    patch: field<boolean>(null),
    graded: field<boolean>(null),
    grading_company: field<string>(null),
    grade: field<string>(null),
    purchase_price: field<number>(null),
    taxes: field<number>(null),
    shipping: field<number>(null),
    total_cost: field<number>(null),
    purchase_date: field<string>(null),
    platform: field<string>(null),
    source_url: field<string>(null),
    notes: field<string>(null),
  };
}

