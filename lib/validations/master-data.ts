import { z } from "zod";
import { productEditingStatusValues } from "@/lib/product-editing-status";

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

const nullableOptionalString = z.preprocess(
  blankToNull,
  z.string().min(1).nullable().optional(),
);

const nullableOptionalUrl = z.preprocess(
  blankToNull,
  z.string().url().nullable().optional(),
);

const nullableOptionalEmail = z.preprocess(
  blankToNull,
  z.string().email().nullable().optional(),
);

function emptyOrNaNToNull(value: unknown) {
  if (value === "" || value === undefined) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value;
}

function trimNullable(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const nullableOptionalMoney = z.preprocess(
  emptyOrNaNToNull,
  z.number().nonnegative().nullable().optional(),
);

const nullableOptionalPositiveInt = z.preprocess(
  emptyOrNaNToNull,
  z.number().int().positive().nullable().optional(),
);

const nullableOptionalDateString = z.preprocess(
  blankToNull,
  z
    .union([
      z.string().refine(
        (value) => !Number.isNaN(new Date(value).getTime()),
        "Invalid date",
      ),
      z.null(),
    ])
    .optional(),
);

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().optional(),
);

const requiredTrimmedString = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, message),
  );

export const saleChannelTypeSchema = z.enum([
  "distributor",
  "store",
  "amazon",
  "cjdropshipping",
]);

export const logisticsPartnerTypeSchema = z.enum([
  "freight_forwarder",
  "carrier",
]);

export const productEditingStatusSchema = z.enum(productEditingStatusValues);

export const manufacturerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  region: z.string().min(1, "Region is required"),
  contactNumber: nullableOptionalString,
  address: nullableOptionalString,
  email: nullableOptionalEmail,
  link: nullableOptionalUrl,
  notes: nullableOptionalString,
});

export const manufacturerUpdateSchema = manufacturerCreateSchema.partial();

export const warehouseCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: nullableOptionalString,
  phoneNumber: nullableOptionalString,
  email: nullableOptionalEmail,
  saleChannelId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
});

export const warehouseUpdateSchema = warehouseCreateSchema.partial();

export const saleChannelCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  type: saleChannelTypeSchema,
  contactNumber: nullableOptionalString,
  address: nullableOptionalString,
  email: nullableOptionalEmail,
  loginPassword: z.preprocess(
    blankToNull,
    z.string().min(8, "Password must be at least 8 characters").max(256).nullable().optional(),
  ),
  link: nullableOptionalUrl,
  notes: nullableOptionalString,
});

export const saleChannelUpdateSchema = saleChannelCreateSchema.partial();

export const saleChannelLocationCreateSchema = z.object({
  identifier: requiredTrimmedString("Identifier is required"),
  name: requiredTrimmedString("Location name is required"),
  recipientName: requiredTrimmedString("Recipient name is required"),
  companyName: nullableOptionalString,
  phoneNumber: nullableOptionalString,
  email: nullableOptionalEmail,
  addressLine1: requiredTrimmedString("Address line 1 is required"),
  addressLine2: nullableOptionalString,
  city: requiredTrimmedString("City is required"),
  stateProvince: nullableOptionalString,
  postalCode: nullableOptionalString,
  country: requiredTrimmedString("Country is required"),
  shippingNotes: nullableOptionalString,
});

export const saleChannelLocationUpdateSchema = saleChannelLocationCreateSchema.partial();

export const logisticsPartnerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  contactNumber: nullableOptionalString,
  link: nullableOptionalUrl,
  email: nullableOptionalEmail,
  address: nullableOptionalString,
  notes: nullableOptionalString,
  type: logisticsPartnerTypeSchema,
});

export const logisticsPartnerUpdateSchema = logisticsPartnerCreateSchema
  .omit({ type: true })
  .partial();

export const productCategoryCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const productCategoryUpdateSchema = productCategoryCreateSchema.partial();

export const productTypeCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const productTypeUpdateSchema = productTypeCreateSchema.partial();

export const productCollectionCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const productCollectionUpdateSchema = productCollectionCreateSchema.partial();

export const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  upcGtin: nullableOptionalString,
  cost: z.number().nonnegative().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  mop: nullableOptionalPositiveInt,
  map: nullableOptionalMoney,
  msrp: nullableOptionalMoney,
  quantityPerCarton: nullableOptionalPositiveInt,
  orderByDate: nullableOptionalDateString,
  editingStatus: productEditingStatusSchema.optional(),
  description: nullableOptionalString,
  imageLink: optionalTrimmedString,
  imageKey: nullableOptionalString,
  barcodeKey: nullableOptionalString,
  packagingKey: nullableOptionalString,
  defaultManufacturerId: z.uuid(),
  categoryId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  typeId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  collectionId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  verified: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

type ProductCreateData = z.infer<typeof productCreateSchema>;
type ProductUpdateData = z.infer<typeof productUpdateSchema>;

type ProductPrismaData = {
  name?: string;
  sku?: string;
  upcGtin?: string | null;
  cost?: number | null;
  price?: number | null;
  mop?: number | null;
  map?: number | null;
  msrp?: number | null;
  quantityPerCarton?: number | null;
  orderByDate?: Date | null;
  editingStatus?: z.infer<typeof productEditingStatusSchema>;
  description?: string | null;
  imageLink?: string;
  imageKey?: string | null;
  barcodeKey?: string | null;
  packagingKey?: string | null;
  defaultManufacturerId?: string;
  categoryId?: string | null;
  typeId?: string | null;
  collectionId?: string | null;
  verified?: boolean;
};

function toPrismaDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  return new Date(value);
}

export function productCreateToPrisma(data: ProductCreateData) {
  return {
    name: data.name,
    sku: data.sku,
    upcGtin: trimNullable(data.upcGtin),
    cost: data.cost ?? null,
    price: data.price ?? null,
    mop: data.mop ?? null,
    map: data.map ?? null,
    msrp: data.msrp ?? null,
    quantityPerCarton: data.quantityPerCarton ?? null,
    orderByDate: data.orderByDate === undefined ? null : toPrismaDate(data.orderByDate),
    editingStatus: data.editingStatus ?? "standard",
    description: trimNullable(data.description),
    imageLink: data.imageLink?.trim() ?? "",
    imageKey: data.imageKey ?? null,
    barcodeKey: data.barcodeKey ?? null,
    packagingKey: data.packagingKey ?? null,
    defaultManufacturerId: data.defaultManufacturerId,
    categoryId: data.categoryId ?? null,
    typeId: data.typeId ?? null,
    collectionId: data.collectionId ?? null,
    verified: data.verified ?? false,
  };
}

export function productUpdateToPrisma(data: ProductUpdateData) {
  const out: ProductPrismaData = {};

  if (data.name !== undefined) out.name = data.name;
  if (data.sku !== undefined) out.sku = data.sku;
  if (data.upcGtin !== undefined) out.upcGtin = trimNullable(data.upcGtin);
  if (data.cost !== undefined) out.cost = data.cost;
  if (data.price !== undefined) out.price = data.price;
  if (data.mop !== undefined) out.mop = data.mop;
  if (data.map !== undefined) out.map = data.map;
  if (data.msrp !== undefined) out.msrp = data.msrp;
  if (data.quantityPerCarton !== undefined) {
    out.quantityPerCarton = data.quantityPerCarton;
  }
  if (data.orderByDate !== undefined) {
    out.orderByDate = toPrismaDate(data.orderByDate);
  }
  if (data.editingStatus !== undefined) out.editingStatus = data.editingStatus;
  if (data.description !== undefined) out.description = trimNullable(data.description);
  if (data.imageLink !== undefined) out.imageLink = data.imageLink.trim();
  if (data.imageKey !== undefined) out.imageKey = data.imageKey;
  if (data.barcodeKey !== undefined) out.barcodeKey = data.barcodeKey;
  if (data.packagingKey !== undefined) out.packagingKey = data.packagingKey;
  if (data.defaultManufacturerId !== undefined) {
    out.defaultManufacturerId = data.defaultManufacturerId;
  }
  if (data.categoryId !== undefined) out.categoryId = data.categoryId;
  if (data.typeId !== undefined) out.typeId = data.typeId;
  if (data.collectionId !== undefined) out.collectionId = data.collectionId;
  if (data.verified !== undefined) out.verified = data.verified;

  return out;
}
