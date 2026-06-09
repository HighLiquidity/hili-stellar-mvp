export type ApiKeyScope = 'onramp' | 'offramp' | 'orders:read';

export type ApiEndpointStatus = 'available' | 'comingSoon' | 'internal' | 'planned';

export type RoadmapItemStatus = 'done' | 'inProgress' | 'planned';

export type ApiKeyRow = {
  id: string;
  label: string;
  keyPrefix: string;
  linkedUserEmail: string;
  scopes: ApiKeyScope[];
  isActive: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  spreadBpsOverride: number | null;
  maxAmountBrl: string | null;
};

export type ApiKeyCreateResult = {
  row: ApiKeyRow;
  secret: string;
};

export type ApiActivityRow = {
  id: string;
  occurredAt: string;
  keyPrefix: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number | null;
  idempotencyKey: string | null;
};
