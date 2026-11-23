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

// 2. Start OmniRoute in production mode if build exists, otherwise dev
const hasBuild = fs.existsSync(".build/next") || fs.existsSync(".next");
const mode = hasBuild ? "start" : "dev";
console.log(`\nStarting OmniRoute in [${mode}] mode on Render...`);

const port = process.env.PORT || "10000";
const child = spawn(
  process.execPath,
  ["--max-old-space-size=380", "scripts/dev/run-next.mjs", mode],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      DASHBOARD_PORT: port,
      API_PORT: port,
      NODE_ENV: "production",
      OMNIROUTE_USE_TURBOPACK: "0",
      OMNIROUTE_MEMORY_MB: "350",
      NODE_OPTIONS: "--max-old-space-size=380",
    }
  }
);

child.on("exit", (code) => {
  console.log(`OmniRoute exited with code ${code}`);
  process.exit(code || 0);
});
