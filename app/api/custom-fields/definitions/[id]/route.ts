import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { CustomFieldService } from "@/lib/services/custom-fields";
import { customFieldDefinitionUpdateSchema } from "@/lib/validations/custom-fields";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { id } = await context.params;

  const existing = await CustomFieldService.getDefinition(id, storeId);
  if (!existing) return jsonError("Not found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = customFieldDefinitionUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await CustomFieldService.updateDefinition(id, storeId, {
      ...parsed.data,
      conditionLogic: parsed.data.conditionLogic,
      conditions: parsed.data.conditions,
    });
    return NextResponse.json(row);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { id } = await context.params;

  const result = await CustomFieldService.deleteDefinition(id, storeId);
  if (!result) return jsonError("Not found", 404);

  return NextResponse.json({ ok: true });
}
