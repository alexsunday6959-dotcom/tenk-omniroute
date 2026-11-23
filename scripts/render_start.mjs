import { resolve } from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

console.log("=== TENK OmniRoute Render Initializer ===");

// 1. Prepare Data Directory
const dataDir = process.env.DATA_DIR || resolve(process.env.USERPROFILE || process.env.HOME || "/tmp", ".omniroute");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = resolve(dataDir, "storage.sqlite");
console.log("Database path:", dbPath);

// 2. Initialize Providers from Environment Variables safely
async function initProviders() {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);
    const now = new Date().toISOString();

    db.exec(`
      CREATE TABLE IF NOT EXISTS provider_connections (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        name TEXT,
        api_key TEXT,
        provider_specific_data TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO provider_connections (
        id, provider, auth_type, name, api_key, provider_specific_data, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    if (process.env.OPENROUTER_API_KEY) {
      insert.run('openrouter-main', 'openrouter', 'apikey', 'OpenRouter Main', process.env.OPENROUTER_API_KEY, null, now, now);
      console.log("Registered: OpenRouter Main");
    }

    if (process.env.GEMINI_API_KEY) {
      insert.run('gemini-main', 'gemini', 'apikey', 'Gemini Main', process.env.GEMINI_API_KEY, null, now, now);
      console.log("Registered: Gemini Main");
    }

    if (process.env.WANDAPI_API_KEY || process.env.CUSTOM_API_KEY) {
      const key = process.env.WANDAPI_API_KEY || process.env.CUSTOM_API_KEY;
      const baseUrl = process.env.WANDAPI_BASE_URL || process.env.CUSTOM_BASE_URL || "https://api.wandapi.com/v1";
      insert.run('wandapi-main', 'openai-compatible-wandapi', 'apikey', 'WandAPI', key, JSON.stringify({ baseUrl }), now, now);
      console.log("Registered: WandAPI");
    }

    console.log("Providers verified successfully.");
  } catch (err) {
    console.warn("Notice: Provider auto-registration skipped:", err.message);
  }
}

await initProviders();

// 3. Start OmniRoute Server with Webpack and low memory footprint (< 400MB)
console.log("\nStarting OmniRoute dev/production server (memory optimized for Render)...");
const port = process.env.PORT || "10000";
const child = spawn(
  process.execPath,
  ["--max-old-space-size=400", "scripts/dev/run-next.mjs", "dev"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      DASHBOARD_PORT: port,
      API_PORT: port,
      OMNIROUTE_USE_TURBOPACK: "0",
      OMNIROUTE_MEMORY_MB: "380",
      NODE_OPTIONS: "--max-old-space-size=400"
    }
  }
);

child.on("exit", (code) => {
  console.log(`OmniRoute exited with code ${code}`);
  process.exit(code || 0);
});
