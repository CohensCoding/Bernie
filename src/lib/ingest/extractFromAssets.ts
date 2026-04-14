import { ExtractionPayloadSchema, emptyExtractionPayload, type ExtractionPayload } from '@/types/extraction';
import { getOpenAiClient, getOpenAiModel } from '@/lib/openai/server';
import { ExtractionPayloadJsonSchema } from '@/lib/ingest/extractionSchemaJson';

export type AssetForExtraction = {
  id: string;
  bucket: string;
  path: string;
  signed_url: string;
};

export type ExtractionResult =
  | { ok: true; extraction: ExtractionPayload; model: string; raw: unknown }
  | { ok: false; error: string };

function mergeWithEmpty(p: unknown): ExtractionPayload {
  const base = emptyExtractionPayload();
  if (typeof p !== 'object' || p == null) return base;
  const merged = { ...base, ...(p as any) };
  const parsed = ExtractionPayloadSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

export async function extractFromAssets(assets: AssetForExtraction[]): Promise<ExtractionResult> {
  if (assets.length === 0) return { ok: false, error: 'No screenshots provided.' };

  const client = getOpenAiClient();
  const model = getOpenAiModel();

  const system = [
    'You are extracting structured sports card + purchase details from eBay listing/purchase screenshots.',
    'Return JSON that matches the provided JSON schema exactly.',
    'If a field is not visible or cannot be inferred, set its value to null and keep confidence null.',
    'Evidence should be short strings pointing to what in the screenshot supports the value (e.g. "title line", "price breakdown", "order total").',
    'All money fields are in USD dollars (not cents). Dates should be YYYY-MM-DD when possible.',
  ].join('\n');

  const userText = [
    'Extract likely sports card identity and purchase details from these screenshots.',
    'Focus on: player name, sport/team, year, brand/set, parallel/numbering, grading, and purchase totals.',
    'Return your best guess but do not hallucinate; use null if unsure.',
  ].join('\n');

  const input: any = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: system }],
    },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: userText },
        ...assets.map((a) => ({
          type: 'input_image',
          image_url: a.signed_url,
          detail: 'high',
        })),
      ],
    },
  ];

  try {
    const resp = await client.responses.create({
      model,
      input,
      // Structured Outputs
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          schema: ExtractionPayloadJsonSchema.schema as any,
          name: ExtractionPayloadJsonSchema.name,
        },
      },
      max_output_tokens: 1200,
    } as any);

    const text = extractOutputText(resp);
    let json: unknown = null;
    try {
      json = typeof text === 'string' && text.length ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const extraction = mergeWithEmpty(json);
    return { ok: true, extraction, model, raw: resp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Extractor failed.' };
  }
}

function extractOutputText(resp: unknown): string {
  const r: any = resp as any;
  if (typeof r?.output_text === 'string' && r.output_text.length) return r.output_text;

  // Fallback: walk response.output -> message content blocks
  const output = Array.isArray(r?.output) ? r.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') return c.text;
    }
  }
  return '';
}

