import { resolve } from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

console.log("=== TENK OmniRoute Render Initializer ===");

// 1. Prepare Data Directory
const dataDir = process.env.DATA_DIR || resolve(process.env.HOME || "/tmp", ".omniroute");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
console.log("Data directory:", dataDir);
const dbPath = resolve(dataDir, "storage.sqlite");

// Remove half-initialized database if _migrations is missing, so OmniRoute can do a clean bootstrap
try {
  if (fs.existsSync(dbPath)) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);
    const hasMigrationTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name='_migrations' OR name='schema_migrations')").get();
    db.close();
    if (!hasMigrationTable) {
      console.log("[STARTUP] Removing unmigrated database to allow clean initial migration...");
      fs.unlinkSync(dbPath);
    }
  }
} catch (e) {
  console.warn("[STARTUP] Notice inspecting database:", e.message);
}

// 2. Start OmniRoute in production mode if build exists, otherwise dev
const hasBuild = fs.existsSync(".build/next") || fs.existsSync(".next");
const mode = hasBuild ? "start" : "dev";
console.log(`\nStarting OmniRoute in [${mode}] mode on Render...`);

// Support Starter plan (512MB RAM) or Pro plan gracefully
const maxHeap = process.env.RENDER_MAX_HEAP || "400";
const port = process.env.PORT || "10000";

const child = spawn(
  process.execPath,
  [`--max-old-space-size=${maxHeap}`, "scripts/dev/run-next.mjs", mode],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      DASHBOARD_PORT: port,
      API_PORT: port,
      NODE_ENV: "production",
      OMNIROUTE_USE_TURBOPACK: "0",
      OMNIROUTE_MEMORY_MB: String(Math.floor(Number(maxHeap) * 0.9)),
      NODE_OPTIONS: `--max-old-space-size=${maxHeap}`,
      TSC_COMPILE_ON_ERROR: "true",
      OMNIROUTE_MAX_PENDING_MIGRATIONS: "0",
      OMNIROUTE_DISABLE_PRESSURE_GUARD: "1",
      OMNIROUTE_PRESSURE_CGROUP_DISABLED: "1",
      OMNIROUTE_PRESSURE_PSI_DISABLED: "1",
    }
  }
);

child.on("exit", (code) => {
  console.log(`OmniRoute exited with code ${code}`);
  process.exit(code || 0);
});
