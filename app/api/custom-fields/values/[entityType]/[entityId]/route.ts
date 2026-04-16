import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { CustomFieldService } from "@/lib/services/custom-fields";
import {
  customFieldEntityTypeSchema,
  customFieldValuesBulkSchema,
} from "@/lib/validations/custom-fields";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ entityType: string; entityId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { entityType, entityId } = await context.params;

  const etParsed = customFieldEntityTypeSchema.safeParse(entityType);
  if (!etParsed.success) return jsonError("Invalid entity type", 400);

  const result = await CustomFieldService.getValuesForEntity(
    storeId,
    etParsed.data,
    entityId,
  );
  return NextResponse.json(result);
}

export async function PUT(request: Request, context: Ctx) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { entityType, entityId } = await context.params;

  const etParsed = customFieldEntityTypeSchema.safeParse(entityType);
  if (!etParsed.success) return jsonError("Invalid entity type", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = customFieldValuesBulkSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    await CustomFieldService.saveValuesForEntity(
      storeId,
      etParsed.data,
      entityId,
      parsed.data.values,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
