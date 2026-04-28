/**
 * Builds cumulative partial Prisma schemas and runs `prisma migrate diff`
 * to emit one SQL file per model in FK-safe order.
 *
 * Usage (from repo root): node prisma/scripts/generate-table-migrations.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SCHEMA_PATH = join(ROOT, "prisma", "schema.prisma");
const OUT_DIR = join(ROOT, "prisma", "_migration_build");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

/** FK-safe order: each model only references models earlier in the list. */
const MODEL_ORDER = [
  "User",
  "Store",
  "UserStore",
  "ProductCategory",
  "ProductType",
  "Manufacturer",
  "SaleChannel",
  "Product",
  "Invoice",
  "PurchaseOrder",
  "PurchaseOrderLine",
  "ManufacturingOrder",
  "ManufacturingOrderManufacturer",
  "ManufacturingOrderPurchaseOrder",
  "LogisticsPartner",
  "Shipping",
  "ManufacturingOrderShipping",
  "PurchaseOrderShipping",
  "ManufacturingOrderPurchaseOrderLine",
  "PurchaseOrderOsd",
  "PurchaseOrderOsdLine",
  "CustomFieldDefinition",
  "CustomFieldCondition",
  "CustomFieldValue",
];

const full = readFileSync(SCHEMA_PATH, "utf8");

const generatorDatasource = full.match(
  /[\s\S]*?(?=^enum )/m
)?.[0];
if (!generatorDatasource) {
  throw new Error("Could not parse generator + datasource block");
}

const enumsBlock = full.match(/^enum [\s\S]*?(?=^model )/m)?.[0];
if (!enumsBlock) {
  throw new Error("Could not parse enums block");
}

const ENUM_NAMES = new Set(
  [...enumsBlock.matchAll(/^enum (\w+)/gm)].map((m) => m[1])
);

const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

const ALL_MODEL_NAMES = new Set(MODEL_ORDER);

/**
 * Drop relation fields whose target model is not in `slice` yet, so partial
 * schemas validate while cumulative tables match the full schema order.
 */
function stripModelForSlice(modelBlock, slice) {
  const lines = modelBlock.split("\n");
  const out = [];
  const header = lines[0];
  out.push(header);
  const sliceSet = new Set(slice);

  for (let li = 1; li < lines.length - 1; li++) {
    const line = lines[li];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("@@")) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("//")) {
      out.push(line);
      continue;
    }

    const fieldMatch = trimmed.match(/^(\w+)\s+(.+)$/);
    if (!fieldMatch) {
      out.push(line);
      continue;
    }

    const afterName = fieldMatch[2];
    const attrMatch = afterName.search(
      /\s@(db\.|id\b|default\b|unique\b|relation\b|map\b|updatedAt\b|ignore\b)/
    );
    const typeChunk =
      attrMatch >= 0 ? afterName.slice(0, attrMatch).trim() : afterName.trim();
    let typePart = typeChunk
      .replace(/\s*@db\.[^\s]+(?:\([^)]*\))?/g, "")
      .trim();
    typePart = typePart.replace(/\s*@map\("[^"]*"\)/g, "").trim();
    const firstTok = typePart.split(/\s+/)[0] || "";
    const base = firstTok.replace(/\?$/, "").replace(/\[\]$/, "");

    if (SCALAR_TYPES.has(base) || ENUM_NAMES.has(base)) {
      out.push(line);
      continue;
    }
    if (ALL_MODEL_NAMES.has(base)) {
      if (sliceSet.has(base)) {
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }

  out.push(lines[lines.length - 1]);
  return out.join("\n");
}

function extractModel(name) {
  const re = new RegExp(
    `^model ${name} \\{[\\s\\S]*?^\\}\\s*`,
    "m"
  );
  const m = full.match(re);
  if (!m) throw new Error(`Model not found: ${name}`);
  return m[0].trimEnd() + "\n";
}

function buildPartialSchema(modelNames) {
  const models = modelNames
    .map((n) => stripModelForSlice(extractModel(n), modelNames))
    .join("\n");
  return `${generatorDatasource}${enumsBlock}\n${models}`;
}

function runDiff({ fromEmpty, fromSchema, toSchema }) {
  const parts = ["npx", "prisma", "migrate", "diff"];
  if (fromEmpty) parts.push("--from-empty");
  if (fromSchema) parts.push(`--from-schema=${fromSchema}`);
  parts.push(`--to-schema=${toSchema}`, "--script");
  return execSync(parts.join(" "), {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let prevPath = null;

for (let i = 0; i < MODEL_ORDER.length; i++) {
  const slice = MODEL_ORDER.slice(0, i + 1);
  const name = MODEL_ORDER[i];
  const partialPath = join(
    OUT_DIR,
    `partial_${String(i + 1).padStart(2, "0")}_${name}.prisma`
  );
  writeFileSync(partialPath, buildPartialSchema(slice), "utf8");

  let sql;
  if (prevPath === null) {
    sql = runDiff({ fromEmpty: true, toSchema: partialPath });
  } else {
    sql = runDiff({ fromSchema: prevPath, toSchema: partialPath });
  }

  const ts = 20260418190000 + i;
  const folderName = `${ts}_${name}`;
  const migDir = join(MIGRATIONS_DIR, folderName);
  mkdirSync(migDir, { recursive: true });
  writeFileSync(join(migDir, "migration.sql"), sql.trim() + "\n", "utf8");
  console.log(`Wrote ${folderName}/migration.sql (${sql.length} chars)`);

  prevPath = partialPath;
}

console.log(
  "Done. Review prisma/migrations then remove prisma/_migration_build if desired."
);
