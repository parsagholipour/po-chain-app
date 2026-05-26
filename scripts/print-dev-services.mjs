import "dotenv/config";

const port = (name, fallback) => String(process.env[name] ?? fallback);

const services = [
  {
    name: "App",
    url: `http://localhost:${port("APP_PORT", 4000)}`,
    note: "Next.js",
  },
  {
    name: "MailHog UI",
    url: `http://localhost:${port("MAILHOG_UI_PORT", 8025)}`,
    note: "captured email",
  },
  {
    name: "MinIO console",
    url: `http://localhost:${port("MINIO_CONSOLE_PORT", 9001)}`,
    note: "object storage UI",
  },
  {
    name: "MinIO API",
    url: `http://localhost:${port("MINIO_API_PORT", 9000)}`,
    note: "S3-compatible API",
  },
  {
    name: "PostgreSQL",
    url: `postgresql://po_app:po_app@localhost:${port("POSTGRES_PORT", 5433)}/po_app`,
    note: "database",
  },
];

const smtpPort = port("MAILHOG_SMTP_PORT", 1025);

console.log("Docker dev services (host)\n");
for (const { name, url, note } of services) {
  const label = name.padEnd(14);
  console.log(`  ${label}  ${url}`);
  if (note) console.log(`  ${" ".repeat(14)}  (${note})`);
}
console.log(`\n  MailHog SMTP   localhost:${smtpPort}  (SMTP, not HTTP)`);
console.log("\nOverride ports via .env or APP_PORT=4001 make docker-dev-build");
