import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { CustomFieldService } from "@/lib/services/custom-fields";
import { customFieldDefinitionCreateSchema } from "@/lib/validations/custom-fields";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") ?? undefined;

  const rows = await CustomFieldService.listDefinitions(storeId, entityType);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = customFieldDefinitionCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await CustomFieldService.createDefinition({
      ...parsed.data,
      required: parsed.data.required ?? false,
      storeId,
      createdById: userId,
      conditionLogic: parsed.data.conditionLogic,
      conditions: parsed.data.conditions,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
