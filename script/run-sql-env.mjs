/**
 * Executa um .sql usando DATABASE_URL do .env (supabase db query).
 * Uso: node script/run-sql-env.mjs script/arquivo.sql
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { platform } from "os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDatabaseUrl() {
  const envPath = join(root, ".env");
  const text = readFileSync(envPath, "utf8");
  const line = text.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL ausente no .env");
  return line.slice("DATABASE_URL=".length).trim();
}

function encodeDatabaseUrl(raw) {
  const s = raw.trim();
  const without = s.slice("postgresql://".length);
  const at = without.indexOf("@");
  const userpass = without.slice(0, at);
  const rest = without.slice(at + 1);
  const colon = userpass.indexOf(":");
  const user = userpass.slice(0, colon);
  const password = userpass.slice(colon + 1);
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${rest}`;
}

const arg = process.argv[2];
if (!arg) {
  console.error("Uso: node script/run-sql-env.mjs <caminho.sql>");
  process.exit(1);
}
const absSql = existsSync(arg) ? arg : join(root, arg);
if (!existsSync(absSql)) {
  console.error("Arquivo SQL não encontrado:", absSql);
  process.exit(1);
}
const dbUrl = encodeDatabaseUrl(loadDatabaseUrl());
const npx = platform() === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(
  npx,
  ["--yes", "supabase", "db", "query", "-f", absSql, "--db-url", dbUrl, "--agent", "no"],
  { cwd: root, stdio: "inherit", env: process.env, shell: true },
);
process.exit(r.status ?? 1);
