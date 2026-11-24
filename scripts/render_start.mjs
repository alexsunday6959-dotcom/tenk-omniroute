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

// 1.5. Ensure Admin Password in SQLite settings
const initialPassword = process.env.INITIAL_PASSWORD || "admin123456";
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS key_value (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (namespace, key)
    )
  `);

  const bcryptMod = await import("bcryptjs");
  const bcrypt = bcryptMod.default || bcryptMod;
  const hashedPassword = bcrypt.hashSync(initialPassword, 12);
  
  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO key_value (namespace, key, value, updated_at)
    VALUES ('settings', ?, ?, CURRENT_TIMESTAMP)
  `);
  
  insertSetting.run('password', hashedPassword);
  insertSetting.run('setupComplete', 'true');
  insertSetting.run('requireLogin', 'true');
  console.log(`[AUTH] Admin password initialized successfully.`);
  db.close();
} catch (err) {
  console.warn("[AUTH] Notice: Could not sync password in render_start:", err.message);
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
    }
  }
);

child.on("exit", (code) => {
  console.log(`OmniRoute exited with code ${code}`);
  process.exit(code || 0);
});
