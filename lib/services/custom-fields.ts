import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  CustomFieldType,
  ConditionLogic,
  ConditionOperator,
} from "@/app/generated/prisma/client";

type ConditionInput = {
  id?: string;
  sourceField: string;
  operator: ConditionOperator;
  value?: string;
};

type CreateDefinitionInput = {
  name: string;
  fieldKey: string;
  type: CustomFieldType;
  entityType: string;
  required?: boolean;
  sortOrder?: number;
  conditionLogic?: ConditionLogic;
  conditions?: ConditionInput[];
  storeId: string;
  createdById: string;
};

type UpdateDefinitionInput = {
  name?: string;
  required?: boolean;
  sortOrder?: number;
  conditionLogic?: ConditionLogic;
  conditions?: ConditionInput[];
};

type ValueItem = {
  definitionId: string;
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: string | null;
  booleanValue?: boolean | null;
  fileKey?: string | null;
};

const includeConditions = { conditions: true } as const;

export class CustomFieldService {
  static async listDefinitions(storeId: string, entityType?: string) {
    return prisma.customFieldDefinition.findMany({
      where: {
        storeId,
        ...(entityType ? { entityType } : {}),
      },
      include: includeConditions,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static async getDefinition(id: string, storeId: string) {
    return prisma.customFieldDefinition.findFirst({
      where: { id, storeId },
      include: includeConditions,
    });
  }

  static async createDefinition(input: CreateDefinitionInput) {
    return prisma.customFieldDefinition.create({
      data: {
        name: input.name,
        fieldKey: input.fieldKey,
        type: input.type,
        entityType: input.entityType,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
        conditionLogic: input.conditionLogic ?? "and",
        storeId: input.storeId,
        createdById: input.createdById,
        ...(input.conditions?.length
          ? {
              conditions: {
                create: input.conditions.map((c) => ({
                  sourceField: c.sourceField,
                  operator: c.operator,
                  value: c.value ?? "",
                })),
              },
            }
          : {}),
      },
      include: includeConditions,
    });
  }

  static async updateDefinition(
    id: string,
    storeId: string,
    data: UpdateDefinitionInput,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.required !== undefined ? { required: data.required } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.conditionLogic !== undefined
            ? { conditionLogic: data.conditionLogic }
            : {}),
        },
      });

      if (data.conditions !== undefined) {
        await tx.customFieldCondition.deleteMany({
          where: { definitionId: id },
        });
        if (data.conditions.length > 0) {
          await tx.customFieldCondition.createMany({
            data: data.conditions.map((c) => ({
              definitionId: id,
              sourceField: c.sourceField,
              operator: c.operator,
              value: c.value ?? "",
            })),
          });
        }
      }

      return tx.customFieldDefinition.findUniqueOrThrow({
        where: { id },
        include: includeConditions,
      });
    });
  }

  static async deleteDefinition(id: string, storeId: string) {
    const def = await prisma.customFieldDefinition.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!def) return null;

    await prisma.customFieldDefinition.delete({ where: { id } });
    return { id };
  }

  static async getValuesForEntity(
    storeId: string,
    entityType: string,
    entityId: string,
  ) {
    const definitions = await this.listDefinitions(storeId, entityType);
    const definitionIds = definitions.map((d) => d.id);
    if (definitionIds.length === 0) return { definitions, values: [] };

    const values = await prisma.customFieldValue.findMany({
      where: {
        storeId,
        entityId,
        definitionId: { in: definitionIds },
      },
    });

    return { definitions, values };
  }

  static async saveValuesForEntity(
    storeId: string,
    entityType: string,
    entityId: string,
    items: ValueItem[],
  ) {
    const definitions = await this.listDefinitions(storeId, entityType);
    const defMap = new Map(definitions.map((d) => [d.id, d]));

    const ops = items
      .filter((item) => defMap.has(item.definitionId))
      .map((item) => {
        const def = defMap.get(item.definitionId)!;
        const data = valueDataForType(def.type, item);

        return prisma.customFieldValue.upsert({
          where: {
            definitionId_entityId: {
              definitionId: item.definitionId,
              entityId,
            },
          },
          create: {
            definitionId: item.definitionId,
            entityId,
            storeId,
            ...data,
          },
          update: data,
        });
      });

    return prisma.$transaction(ops);
  }
}

function valueDataForType(type: CustomFieldType, item: ValueItem) {
  const clear = {
    textValue: null,
    numberValue: null,
    dateValue: null,
    booleanValue: null,
    fileKey: null,
  };

  switch (type) {
    case "text":
      return { ...clear, textValue: item.textValue ?? null };
    case "number":
      return { ...clear, numberValue: item.numberValue ?? null };
    case "date":
      return {
        ...clear,
        dateValue: item.dateValue ? new Date(item.dateValue) : null,
      };
    case "boolean":
      return { ...clear, booleanValue: item.booleanValue ?? null };
    case "file":
    case "image":
      return { ...clear, fileKey: item.fileKey ?? null };
  }
}
