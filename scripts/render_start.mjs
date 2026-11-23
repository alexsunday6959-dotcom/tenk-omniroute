import { resolve } from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

console.log("=== TENK OmniRoute Render Initializer ===");

// 1. Prepare Data Directory
const dataDir = process.env.DATA_DIR || resolve(process.env.USERPROFILE || process.env.HOME || "/tmp", ".omniroute");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log("Data directory:", dataDir);

// 2. Start OmniRoute Server with Webpack and low memory footprint (< 400MB)
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
