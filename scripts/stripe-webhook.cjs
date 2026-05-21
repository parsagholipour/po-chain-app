/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Runs `stripe listen` for local webhook forwarding.
 * npm on Windows often invokes cmd.exe with a PATH that omits WinGet-installed CLIs;
 * this script resolves stripe.exe explicitly.
 */
const { spawnSync, execFileSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");

const FORWARD_TO =
  process.env.STRIPE_WEBHOOK_FORWARD_TO ||
  "http://localhost:4000/api/payments/stripe/webhook";

function findStripe() {
  const envPath = process.env.STRIPE_CLI_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  try {
    if (process.platform === "win32") {
      const out = execFileSync("where", ["stripe"], { encoding: "utf8" });
      const first = out.trim().split(/\r?\n/).filter(Boolean)[0];
      if (first && existsSync(first)) {
        return first;
      }
    } else {
      const out = execFileSync("which", ["stripe"], { encoding: "utf8" });
      const p = out.trim().split(/\n/).filter(Boolean)[0];
      if (p && existsSync(p)) {
        return p;
      }
    }
  } catch {
    // PATH lookup failed
  }

  if (process.platform === "win32") {
    const base = join(
      os.homedir(),
      "AppData",
      "Local",
      "Microsoft",
      "WinGet",
      "Packages"
    );
    if (existsSync(base)) {
      for (const name of readdirSync(base)) {
        if (name.startsWith("Stripe.StripeCli")) {
          const candidate = join(base, name, "stripe.exe");
          if (existsSync(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

const stripe = findStripe();
if (!stripe) {
  console.error(
    [
      "Stripe CLI not found.",
      "",
      "Install:",
      "  Windows: winget install Stripe.StripeCli -e",
      "  https://stripe.com/docs/stripe-cli#install",
      "",
      "Or set STRIPE_CLI_PATH to the full path of stripe (or stripe.exe).",
    ].join("\n")
  );
  process.exit(1);
}

const result = spawnSync(
  stripe,
  ["listen", "--forward-to", FORWARD_TO],
  { stdio: "inherit" }
);

process.exit(result.status === null ? 1 : result.status);
