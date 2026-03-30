/**
 * Restaura um dump plain SQL (pg_dump) no Postgres de DATABASE_URL no .env.
 * Usa psql (PostgreSQL client) — necessário para COPY ... FROM stdin.
 * Fallback documentado: supabase db query não suporta dumps completos.
 *
 * Uso: node script/restore-pgdump.mjs [caminho-do-dump.sql]
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { platform } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDatabaseUrl() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    throw new Error(`Arquivo .env não encontrado em ${envPath}`);
  }
  const text = readFileSync(envPath, "utf8");
  const line = text.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL não definido no .env");
  const raw = line.slice("DATABASE_URL=".length).trim();
  return raw.trim();
}

const dumpArg = process.argv[2];
const defaultDump = "C:\\Users\\Win10\\Desktop\\estudo 01.txt";
const dumpPath = resolve(dumpArg || process.env.RESTORE_DUMP_PATH || defaultDump);

if (!existsSync(dumpPath)) {
  console.error("Arquivo de dump não encontrado:", dumpPath);
  process.exit(1);
}

/** Remove \\restrict (psql 17+ meta) se o cliente for mais antigo ou falhar. */
function prepareDumpForPsql(sourcePath) {
  const raw = readFileSync(sourcePath, "utf8");
  const filtered = raw
    .split("\n")
    .filter((line) => !/^\s*\\restrict\b/.test(line) && !/^\s*\\unrestrict\b/.test(line))
    .join("\n");
  if (filtered === raw) return sourcePath;
  const out = join(tmpdir(), `pg-restore-${Date.now()}.sql`);
  writeFileSync(out, filtered, "utf8");
  console.log("Dump pré-processado (removido \\restrict):", out);
  return out;
}

function findPsql() {
  if (platform() !== "win32") {
    return "psql";
  }
  const candidates = [
    join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL", "17", "bin", "psql.exe"),
    join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL", "16", "bin", "psql.exe"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "psql";
}

const dbUrl = loadDatabaseUrl();
console.log("Restaurando:", dumpPath);
console.log("Host:", dbUrl.replace(/:[^:@/]+@/, ":****@"));

const sqlFile = prepareDumpForPsql(dumpPath);
const psqlBin = findPsql();
if (!existsSync(psqlBin) && psqlBin === "psql") {
  console.error(
    "psql não encontrado. Instale PostgreSQL (inclui psql) ou adicione-o ao PATH.",
  );
  if (sqlFile !== dumpPath) unlinkSync(sqlFile);
  process.exit(1);
}

const skipPreClean = process.env.SKIP_PRE_RESTORE_CLEAN === "1";
const preClean = join(root, "script", "pre-restore-clean.sql");

if (!skipPreClean && existsSync(preClean)) {
  console.log("Limpando public + _system (defina SKIP_PRE_RESTORE_CLEAN=1 para pular)...");
  const pre = spawnSync(
    psqlBin,
    ["-v", "ON_ERROR_STOP=1", "-f", preClean, dbUrl],
    { cwd: root, stdio: "inherit", env: process.env, shell: false },
  );
  if (pre.status !== 0 || pre.error) {
    console.error("Falha no pré-restore (clean).");
    if (sqlFile !== dumpPath) unlinkSync(sqlFile);
    process.exit(pre.status ?? 1);
  }
}

const r = spawnSync(
  psqlBin,
  ["-v", "ON_ERROR_STOP=1", "-f", sqlFile, dbUrl],
  { cwd: root, stdio: "inherit", env: process.env, shell: false },
);

if (r.error) {
  console.error(r.error);
}

if (sqlFile !== dumpPath) {
  try {
    unlinkSync(sqlFile);
  } catch {
    /* ignore */
  }
}

process.exit(r.status ?? (r.error ? 1 : 0));
