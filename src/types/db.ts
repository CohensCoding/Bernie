export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISOTimestamp = string; // timestamptz serialized

export type CardAssetType = 'screenshot';

export type Card = {
  id: UUID;
  owner_id: UUID | null;

  title_raw: string | null;
  player_name: string | null;
  sport: string | null;
  team: string | null;

  year: number | null;
  brand: string | null;
  set_name: string | null;
  subset: string | null;
  card_number: string | null;
  parallel: string | null;

  serial_number: number | null;
  print_run: number | null;

  rookie: boolean;
  auto: boolean;
  patch: boolean;
  card_type_tags: string[];

  graded: boolean;
  grading_company: string | null;
  grade: string | null;

  notes: string | null;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
};

export type CardInsert = Omit<Card, 'id' | 'created_at' | 'updated_at'> & {
  id?: UUID;
  created_at?: ISOTimestamp;
  updated_at?: ISOTimestamp;
};

export type CardUpdate = Partial<Omit<Card, 'id' | 'created_at' | 'updated_at'>> & {
  updated_at?: ISOTimestamp;
};

export type CardTransaction = {
  id: UUID;
  owner_id: UUID | null;

  card_id: UUID;

  platform: string | null;
  source_url: string | null;
  title_raw: string | null;
  purchase_date: ISODate | null;

  purchase_price_cents: number;
  taxes_cents: number;
  shipping_cents: number;
  total_cost_cents: number;

  notes: string | null;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
};

export type CardTransactionInsert = Omit<CardTransaction, 'id' | 'created_at' | 'updated_at'> & {
  id?: UUID;
  created_at?: ISOTimestamp;
  updated_at?: ISOTimestamp;
};

export type CardTransactionUpdate = Partial<
  Omit<CardTransaction, 'id' | 'card_id' | 'created_at' | 'updated_at'>
> & {
  updated_at?: ISOTimestamp;
};

export type CardAsset = {
  id: UUID;
  owner_id: UUID | null;

  card_id: UUID | null;
  transaction_id: UUID | null;

  asset_type: CardAssetType;

  bucket: string;
  path: string;

  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;

  extraction_model: string | null;
  extraction_confidence: number | null;
  extraction_raw: unknown | null;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
};

export type CardAssetInsert = Omit<CardAsset, 'id' | 'created_at' | 'updated_at'> & {
  id?: UUID;
  created_at?: ISOTimestamp;
  updated_at?: ISOTimestamp;
};

export type CardAssetUpdate = Partial<Omit<CardAsset, 'id' | 'created_at' | 'updated_at'>> & {
  updated_at?: ISOTimestamp;
};
