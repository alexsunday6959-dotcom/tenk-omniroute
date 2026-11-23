import { resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

console.log("=== TENK OmniRoute Render Initializer ===");

// 1. Prepare Data Directory
const dataDir = process.env.DATA_DIR || resolve(process.env.HOME || "/tmp", ".omniroute");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
console.log("Data directory:", dataDir);

// 2. Install TypeScript dev-deps required for Next.js dev server
//    Render's build step runs with NODE_ENV=production which skips devDependencies.
//    Next.js dev mode requires typescript and @types/react to be present.
console.log("\nInstalling TypeScript dependencies for dev mode...");
try {
  execSync(
    "npm install --no-save typescript @types/react @types/react-dom @types/node babel-plugin-react-compiler 2>&1",
    { stdio: "inherit", timeout: 120_000 }
  );
  console.log("✅ TypeScript dependencies installed.");
} catch (e) {
  console.warn("⚠️  Failed to install TypeScript deps:", e.message);
  console.warn("   Proceeding anyway — server may still start if .build cache exists.");
}

// 3. Start OmniRoute Server
//    Use dev mode with webpack (Turbopack off) and conservative memory limit
//    to fit within Render Free tier's 512MB.
console.log("\nStarting OmniRoute dev server (memory optimized for Render)...");
const port = process.env.PORT || "10000";
const child = spawn(
  process.execPath,
  ["--max-old-space-size=450", "scripts/dev/run-next.mjs", "dev"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      DASHBOARD_PORT: port,
      API_PORT: port,
      OMNIROUTE_USE_TURBOPACK: "0",
      OMNIROUTE_MEMORY_MB: "420",
      NODE_OPTIONS: "--max-old-space-size=450",
      // Ensure TypeScript doesn't block startup with strict checks
      TSC_COMPILE_ON_ERROR: "true",
    }
  }
);

child.on("exit", (code) => {
  console.log(`OmniRoute exited with code ${code}`);
  process.exit(code || 0);
});
