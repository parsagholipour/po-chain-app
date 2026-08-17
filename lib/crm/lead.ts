export type CrmSyncTrigger = "scheduled" | "manual" | "webhook";

export type CrmLeadOwner = {
  id: string;
  name: string | null;
  alias: string | null;
  email: string | null;
};

export type MappedSampleProduct = {
  crmLineId: string;
  crmProductId: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  description: string | null;
  displayOrder: number;
  product: Record<string, unknown> | null;
};

export type MappedLead = {
  crmLeadId: string;
  organizationId: string;
  status: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  website: string | null;
  description: string | null;
  ownerId: string;
  owner: CrmLeadOwner;
  rating: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  numberOfEmployees: number | null;
  annualRevenue: string | null;
  leadSource: string | null;
  industry: string | null;
  sampleRequestedDate: Date | null;
  sampleStatus: string | null;
  courier: string | null;
  trackingNumber: string | null;
  deliveryDate: Date | null;
  convertedAt: Date | null;
  convertedAccountId: string | null;
  convertedContactId: string | null;
  convertedOpportunityId: string | null;
  createdById: string;
  updatedById: string;
  crmCreatedAt: Date;
  crmUpdatedAt: Date;
  shipment: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  sampleProducts: MappedSampleProduct[];
};

export type MappedDeletedLead = {
  crmLeadId: string;
  deletedAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function noneToNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim();
  if (!trimmed || trimmed === "--None--") return null;
  return trimmed;
}

export function parseIsoDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = noneToNull(record[key]);
  if (!value) throw new Error(`Lead is missing ${key}`);
  return value;
}

function requiredDate(record: Record<string, unknown>, key: string) {
  const parsed = parseIsoDate(record[key]);
  if (!parsed) throw new Error(`Lead is missing ${key}`);
  return parsed;
}

function optionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function optionalDecimalString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = noneToNull(value);
  if (!text) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return text;
}

function requiredDecimalString(value: unknown, fallback: string) {
  return optionalDecimalString(value) ?? fallback;
}

export function isStaleLeadUpdate(storedUpdatedAt: Date, incomingUpdatedAt: Date) {
  return incomingUpdatedAt.getTime() < storedUpdatedAt.getTime();
}

export function isStaleLeadDelete(storedUpdatedAt: Date, deletedAt: Date) {
  return deletedAt.getTime() < storedUpdatedAt.getTime();
}

function mapOwner(record: Record<string, unknown>, ownerId: string): CrmLeadOwner {
  const owner = asRecord(record.owner);
  return {
    id: noneToNull(owner?.id) ?? ownerId,
    name: noneToNull(owner?.name),
    alias: noneToNull(owner?.alias),
    email: noneToNull(owner?.email),
  };
}

function mapSampleProduct(value: unknown): MappedSampleProduct | null {
  const row = asRecord(value);
  if (!row) return null;
  const crmLineId = noneToNull(row.id);
  const crmProductId = noneToNull(row.productId);
  if (!crmLineId || !crmProductId) return null;
  const product = asRecord(row.product);
  return {
    crmLineId,
    crmProductId,
    quantity: requiredDecimalString(row.quantity, "0"),
    unitPrice: requiredDecimalString(row.unitPrice, "0"),
    totalPrice: requiredDecimalString(row.totalPrice, "0"),
    description: noneToNull(row.description),
    displayOrder: optionalInt(row.displayOrder) ?? 0,
    product,
  };
}

export function mapCrmLead(value: unknown): MappedLead {
  const record = asRecord(value);
  if (!record) throw new Error("Lead payload must be an object");

  const crmLeadId = requiredString(record, "id");
  const ownerId = requiredString(record, "ownerId");
  const sampleProducts = Array.isArray(record.sampleProducts)
    ? record.sampleProducts
        .map((item) => mapSampleProduct(item))
        .filter((item): item is MappedSampleProduct => item != null)
    : [];

  return {
    crmLeadId,
    organizationId: requiredString(record, "organizationId"),
    status: noneToNull(record.status) ?? "New",
    salutation: noneToNull(record.salutation),
    firstName: noneToNull(record.firstName),
    lastName: noneToNull(record.lastName),
    company: noneToNull(record.company),
    title: noneToNull(record.title),
    website: noneToNull(record.website),
    description: noneToNull(record.description),
    ownerId,
    owner: mapOwner(record, ownerId),
    rating: noneToNull(record.rating),
    phone: noneToNull(record.phone),
    email: noneToNull(record.email),
    country: noneToNull(record.country),
    street: noneToNull(record.street),
    postalCode: noneToNull(record.postalCode),
    city: noneToNull(record.city),
    state: noneToNull(record.state),
    numberOfEmployees: optionalInt(record.numberOfEmployees),
    annualRevenue: optionalDecimalString(record.annualRevenue),
    leadSource: noneToNull(record.leadSource),
    industry: noneToNull(record.industry),
    sampleRequestedDate: parseIsoDate(record.sampleRequestedDate),
    sampleStatus: noneToNull(record.sampleStatus),
    courier: noneToNull(record.courier),
    trackingNumber: noneToNull(record.trackingNumber),
    deliveryDate: parseIsoDate(record.deliveryDate),
    convertedAt: parseIsoDate(record.convertedAt),
    convertedAccountId: noneToNull(record.convertedAccountId),
    convertedContactId: noneToNull(record.convertedContactId),
    convertedOpportunityId: noneToNull(record.convertedOpportunityId),
    createdById: requiredString(record, "createdById"),
    updatedById: requiredString(record, "updatedById"),
    crmCreatedAt: requiredDate(record, "createdAt"),
    crmUpdatedAt: requiredDate(record, "updatedAt"),
    shipment: asRecord(record.shipment),
    payload: record,
    sampleProducts,
  };
}

export function mapDeletedLead(value: unknown): MappedDeletedLead {
  const record = asRecord(value);
  if (!record) throw new Error("Deleted lead payload must be an object");
  return {
    crmLeadId: requiredString(record, "id"),
    deletedAt: parseIsoDate(record.deletedAt) ?? new Date(),
  };
}

export function sampleProductLineIds(lines: MappedSampleProduct[]) {
  return lines.map((line) => line.crmLineId);
}

export type CrmWebhookEnvelope = {
  id: string;
  event: string;
  createdAt: string;
  organizationId: string;
  data: unknown;
};

export function parseCrmWebhookEnvelope(value: unknown): CrmWebhookEnvelope {
  const record = asRecord(value);
  if (!record) throw new Error("Webhook payload must be an object");
  const id = noneToNull(record.id);
  const event = noneToNull(record.event);
  const createdAt = noneToNull(record.createdAt);
  const organizationId = noneToNull(record.organizationId);
  if (!id || !event || !createdAt || !organizationId) {
    throw new Error("Webhook payload is missing required envelope fields");
  }
  return {
    id,
    event,
    createdAt,
    organizationId,
    data: record.data,
  };
}
