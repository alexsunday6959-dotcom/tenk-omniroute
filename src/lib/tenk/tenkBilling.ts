/**
 * TENK Store Token Billing & Authentication Module for OmniRoute.
 * Bridges OmniRoute directly with TENK Store's Turso Database.
 * 
 * Features:
 * 1. Authenticates 'sk-tenk-...' API keys directly against Turso Database.
 * 2. Real-time balance verification (Standard & Pro balances).
 * 3. Atomic token deduction and live telemetry logging into api_requests_log.
 * 4. In-memory short-lived caching for sub-millisecond response latency.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface TenkUser {
  telegram_id: number;
  username: string;
  balance: number;
  pro_balance: number;
  api_key: string;
  pro_api_key: string;
  is_banned: number;
  total_spent: number;
}

interface CachedUser {
  user: TenkUser | null;
  timestamp: number;
}

const USER_CACHE: Map<string, CachedUser> = new Map();
const CACHE_TTL_MS = 15_000; // 15 seconds fast cache

let cachedTursoUrl: string | null = null;
let cachedTursoToken: string | null = null;

function getTursoCredentials(): { url: string; token: string } {
  if (cachedTursoUrl && cachedTursoToken) {
    return { url: cachedTursoUrl, token: cachedTursoToken };
  }

  let dbUrl = process.env.TURSO_DATABASE_URL || "";
  let authToken = process.env.TURSO_AUTH_TOKEN || "";

  if (!dbUrl || !authToken) {
    const candidatePaths = [
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "..", ".env"),
      resolve(__dirname, "..", "..", "..", ".env"),
    ];

    for (const p of candidatePaths) {
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, "utf-8");
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("TURSO_DATABASE_URL=")) {
              dbUrl = trimmed.split("=")[1].trim().replace(/["']/g, "");
            } else if (trimmed.startsWith("TURSO_AUTH_TOKEN=")) {
              authToken = trimmed.split("=")[1].trim().replace(/["']/g, "");
            }
          }
          if (dbUrl && authToken) break;
        } catch {}
      }
    }
  }

  let pUrl = (dbUrl || "").replace("libsql://", "https://").replace(/\/$/, "");
  if (pUrl && !pUrl.endsWith("/v2/pipeline")) {
    pUrl += "/v2/pipeline";
  }

  cachedTursoUrl = pUrl;
  cachedTursoToken = authToken;
  return { url: pUrl, token: authToken };
}

/**
 * Executes a SQL statement against Turso via its HTTP v2 Pipeline API.
 */
async function executeTursoQuery(sql: string, params: any[] = []): Promise<any[]> {
  const { url, token } = getTursoCredentials();
  if (!url || !token) {
    console.error("[TENK Billing] Missing Turso credentials!");
    return [];
  }

  const args = params.map((p) => {
    if (p === null || p === undefined) return { type: "null" };
    if (typeof p === "boolean") return { type: "integer", value: p ? "1" : "0" };
    if (typeof p === "number") {
      return Number.isInteger(p) ? { type: "integer", value: p.toString() } : { type: "float", value: p };
    }
    return { type: "text", value: p.toString() };
  });

  const body = {
    requests: [
      {
        type: "execute",
        stmt: { sql, args },
      },
      { type: "close" },
    ],
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error(`[TENK Billing] Turso HTTP error: ${resp.status}`);
      return [];
    }

    const data: any = await resp.json();
    const result = data.results?.[0]?.response?.result;
    if (!result || !result.rows || !result.cols) return [];

    const cols = result.cols.map((c: any) => c.name);
    return result.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      row.forEach((cell, idx) => {
        const col = cols[idx];
        const val = cell.value;
        if (cell.type === "integer") obj[col] = parseInt(val, 10);
        else if (cell.type === "float") obj[col] = parseFloat(val);
        else if (cell.type === "null") obj[col] = null;
        else obj[col] = val;
      });
      return obj;
    });
  } catch (err) {
    console.error("[TENK Billing] Turso execution exception:", err);
    return [];
  }
}

/**
 * Checks if a string is a genuine TENK Store API key.
 */
export function isTenkApiKey(apiKey: string | null | undefined): boolean {
  if (!apiKey) return false;
  const k = apiKey.trim();
  return k.startsWith("sk-tenk-eco-") || k.startsWith("sk-tenk-pro-") || k.startsWith("sk-tenk-");
}

/**
 * Retrieves a user from Turso Database by their API key with memory caching.
 */
export async function getTenkUserByKey(apiKey: string): Promise<TenkUser | null> {
  const k = apiKey.trim();
  const cached = USER_CACHE.get(k);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.user;
  }

  const sql = `
    SELECT telegram_id, username, balance, pro_balance, api_key, pro_api_key, is_banned, total_spent
    FROM users
    WHERE api_key = ? OR pro_api_key = ?
    LIMIT 1
  `;
  const rows = await executeTursoQuery(sql, [k, k]);
  if (!rows || rows.length === 0) {
    USER_CACHE.set(k, { user: null, timestamp: now });
    return null;
  }

  const row = rows[0];
  const user: TenkUser = {
    telegram_id: row.telegram_id,
    username: row.username || "",
    balance: Number(row.balance || 0),
    pro_balance: Number(row.pro_balance || 0),
    api_key: row.api_key || "",
    pro_api_key: row.pro_api_key || "",
    is_banned: Number(row.is_banned || 0),
    total_spent: Number(row.total_spent || 0),
  };

  USER_CACHE.set(k, { user, timestamp: now });
  return user;
}

/**
 * Validates a TENK API key. Returns true if key exists and user is active.
 */
export async function isValidTenkApiKey(apiKey: string): Promise<boolean> {
  if (!isTenkApiKey(apiKey)) return false;
  const user = await getTenkUserByKey(apiKey);
  return user !== null && user.is_banned === 0;
}

/**
 * Enforces TENK token balance and quota rules for incoming requests.
 */
export async function enforceTenkTokenAccess(
  apiKey: string,
  model: string | null
): Promise<{ allowed: boolean; user: TenkUser | null; errorResponse: Response | null }> {
  const user = await getTenkUserByKey(apiKey);

  if (!user) {
    return {
      allowed: false,
      user: null,
      errorResponse: new Response(
        JSON.stringify({
          error: {
            message: "Invalid TENK Store API Key. Please get a valid key from Telegram Bot @TenkStoreBot.",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (user.is_banned === 1) {
    return {
      allowed: false,
      user,
      errorResponse: new Response(
        JSON.stringify({
          error: {
            message: "Your TENK Store account has been suspended. Please contact support @TenkStoreBot.",
            type: "account_suspended",
            code: "user_banned",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const m = (model || "").toLowerCase();
  const isProKey = apiKey.startsWith("sk-tenk-pro-") || user.pro_api_key === apiKey;
  const isProModel =
    m.includes("gpt-4") ||
    m.includes("claude-3-7") ||
    m.includes("claude-sonnet") ||
    m.includes("claude-opus") ||
    m.includes("deepseek-r1") ||
    m.includes("gemini-2.5-pro") ||
    m.includes("gemini-4");

  const effectiveBalance = isProModel || isProKey ? Math.max(user.pro_balance, user.balance) : user.balance;

  if (effectiveBalance <= 0) {
    const errorMsg = `⚡ សមតុល្យ Token របស់អ្នកមិនគ្រប់គ្រាន់ទេ (Balance: 0 Token)។ សូមចូលទៅកាន់ Telegram Bot @TenkStoreBot ដើម្បីបញ្ចូលសមតុល្យតាម KHQR បន្ថែម!`;
    return {
      allowed: false,
      user,
      errorResponse: new Response(
        JSON.stringify({
          error: {
            message: errorMsg,
            type: "insufficient_quota",
            code: "insufficient_token_balance",
            topup_url: "https://t.me/TenkStoreBot",
          },
        }),
        { status: 402, headers: { "Content-Type": "application/json; charset=utf-8" } }
      ),
    };
  }

  return { allowed: true, user, errorResponse: null };
}

/**
 * Deducts tokens from the user's Turso balance and writes audit record into api_requests_log.
 */
export async function deductTenkTokens(
  apiKey: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number = 0
): Promise<void> {
  const user = await getTenkUserByKey(apiKey);
  if (!user) return;

  const totalTokens = Math.max(1, inputTokens + outputTokens);
  const m = (model || "").toLowerCase();
  const isProModel =
    m.includes("gpt-4") ||
    m.includes("claude-sonnet") ||
    m.includes("claude-opus") ||
    m.includes("deepseek-r1") ||
    m.includes("gemini-2.5-pro") ||
    m.includes("gemini-4");

  const isProKey = apiKey.startsWith("sk-tenk-pro-") || user.pro_api_key === apiKey;
  const isProDeduction = isProModel || isProKey;

  // Invalidate cache immediately
  USER_CACHE.delete(apiKey.trim());

  if (isProDeduction && user.pro_balance > 0) {
    const sql = `
      UPDATE users 
      SET pro_balance = MAX(0, pro_balance - ?), total_spent = total_spent + ?
      WHERE pro_api_key = ? OR api_key = ?
    `;
    await executeTursoQuery(sql, [totalTokens, totalTokens, apiKey, apiKey]);
  } else {
    const sql = `
      UPDATE users 
      SET balance = MAX(0, balance - ?), total_spent = total_spent + ?
      WHERE api_key = ? OR pro_api_key = ?
    `;
    await executeTursoQuery(sql, [totalTokens, totalTokens, apiKey, apiKey]);
  }

  // Insert audit record
  const logSql = `
    INSERT INTO api_requests_log (
      telegram_id, api_key, model, tier, input_tokens, output_tokens, tokens_charged, latency_ms, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success')
  `;
  await executeTursoQuery(logSql, [
    user.telegram_id,
    apiKey,
    model,
    isProDeduction ? "PRO" : "STANDARD",
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
  ]);
}
