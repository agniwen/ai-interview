#!/usr/bin/env node
// =====================================================================
// resume-parser-skill 客户端 / Claude Code skill thin client.
//
// 三个子命令 / Three subcommands:
//   login            走 OAuth 设备流，token 写到 ~/.config/resume-parser-skill/token.json
//   login --check    exit 0 if token is still valid, exit 2 otherwise
//   run <pdf-path>   上传单份 PDF，落盘 <basename>.profile.json + <basename>.report.md
//
// Zero deps — 仅用 Node 18+ 的 globalThis.fetch / FormData / Blob + node:fs/path/os.
// =====================================================================

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve as resolvePath } from "node:path";
import process from "node:process";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";

const DEFAULT_BASE_URL = "https://interview.chainthink.cn";
const BASE_URL = (process.env.RESUME_SKILL_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const SCOPE = "resume:parse";

const CONFIG_DIR =
  process.env.RESUME_SKILL_CONFIG_DIR ?? join(homedir(), ".config", "resume-parser-skill");
const TOKEN_PATH = join(CONFIG_DIR, "token.json");

const EXIT = {
  FILE_TOO_LARGE: 4,
  GENERIC: 9,
  OK: 0,
  RATE_LIMITED: 3,
  UNAUTHENTICATED: 2,
  UNSUPPORTED_MEDIA: 5,
  USAGE: 1,
};

// ---- token storage --------------------------------------------------

function readToken() {
  try {
    const raw = readFileSync(TOKEN_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.accessToken === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeToken(record) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), { mode: 0o600 });
}

// ---- helpers --------------------------------------------------------

function sleep(ms) {
  return setTimeoutPromise(ms);
}

// ---- HTTP -----------------------------------------------------------

async function postJSON(path, body, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    body: JSON.stringify(body ?? {}),
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    method: "POST",
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  return { ok: res.ok, payload, status: res.status };
}

async function postMultipart(path, fields, token) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value.value, value.filename);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  return { headers: res.headers, ok: res.ok, payload, status: res.status };
}

// ---- subcommand: login ---------------------------------------------

function isTokenLikelyValid(record) {
  if (!record?.accessToken) {
    return false;
  }
  return true;
}

async function probeToken(token) {
  // 探测当前 token 是否仍可用 / probe with a tiny multipart that we expect to 400 on missing file.
  // 命中 401/403 则视为 token 无效；4xx/200 都视为认证有效。
  const form = new FormData();
  const res = await fetch(`${BASE_URL}/api/skill/v1/parse-resume`, {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  return res.status !== 401 && res.status !== 403;
}

async function loginCheck() {
  const record = readToken();
  if (!isTokenLikelyValid(record)) {
    console.error("not authenticated — run `login` to authorize.");
    process.exit(EXIT.UNAUTHENTICATED);
  }
  const ok = await probeToken(record.accessToken).catch(() => false);
  if (!ok) {
    console.error("token rejected by server — run `login` to re-authorize.");
    process.exit(EXIT.UNAUTHENTICATED);
  }
  console.log(`authenticated · base=${BASE_URL} · scope=${record.scope}`);
  process.exit(EXIT.OK);
}

async function loginInteractive() {
  const start = await postJSON("/api/skill/v1/auth/device/code", { scope: SCOPE });
  if (!start.ok || !start.payload?.device_code) {
    console.error("failed to start device flow:", start.payload?.error ?? start.status);
    process.exit(EXIT.GENERIC);
  }
  const { device_code, user_code, verification_uri_complete, expires_in, interval } = start.payload;

  console.log("");
  console.log("=== 请在浏览器完成授权 / Open this URL in a browser ===");
  console.log("");
  console.log(`  URL:        ${verification_uri_complete}`);
  console.log(`  授权码 / Code: ${user_code}`);
  console.log("");
  console.log(`等待授权中... 最多 ${expires_in} 秒。`);
  console.log("");

  const deadline = Date.now() + expires_in * 1000;
  let pollSeconds = interval ?? 5;

  while (Date.now() < deadline) {
    await sleep(pollSeconds * 1000);
    const poll = await postJSON("/api/skill/v1/auth/device/token", { device_code });
    if (poll.ok && poll.payload?.access_token) {
      writeToken({
        accessToken: poll.payload.access_token,
        baseURL: BASE_URL,
        obtainedAt: new Date().toISOString(),
        scope: poll.payload.scope ?? SCOPE,
      });
      console.log(`✅ 授权成功，token 已保存到 ${TOKEN_PATH}`);
      process.exit(EXIT.OK);
    }
    const err = poll.payload?.error;
    if (err === "authorization_pending") {
      continue;
    }
    if (err === "slow_down") {
      pollSeconds += 5;
      continue;
    }
    if (err === "access_denied") {
      console.error("❌ 用户拒绝了授权。");
      process.exit(EXIT.UNAUTHENTICATED);
    }
    if (err === "expired_token") {
      console.error("❌ 授权码已过期，请重新运行 login。");
      process.exit(EXIT.UNAUTHENTICATED);
    }
    console.error(`授权失败：${err ?? `HTTP ${poll.status}`}`);
    process.exit(EXIT.GENERIC);
  }

  console.error("❌ 授权超时（10 分钟），请重试。");
  process.exit(EXIT.UNAUTHENTICATED);
}

// ---- subcommand: run ------------------------------------------------

function uniqueOutputPath(target) {
  if (!existsSync(target)) {
    return target;
  }
  const ext = extname(target);
  const stem = target.slice(0, -ext.length);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return `${stem}.${stamp}${ext}`;
}

async function runParse(pdfPath) {
  const record = readToken();
  if (!isTokenLikelyValid(record)) {
    console.error(JSON.stringify({ error: "unauthenticated" }));
    process.exit(EXIT.UNAUTHENTICATED);
  }

  const abs = resolvePath(pdfPath);
  if (!existsSync(abs)) {
    console.error(`file not found: ${abs}`);
    process.exit(EXIT.USAGE);
  }
  const stat = statSync(abs);
  if (!stat.isFile()) {
    console.error(`not a regular file: ${abs}`);
    process.exit(EXIT.USAGE);
  }
  if (extname(abs).toLowerCase() !== ".pdf") {
    console.error(JSON.stringify({ error: "unsupported_media", path: abs }));
    process.exit(EXIT.UNSUPPORTED_MEDIA);
  }
  if (stat.size > 20 * 1024 * 1024) {
    console.error(JSON.stringify({ error: "file_too_large", path: abs, size: stat.size }));
    process.exit(EXIT.FILE_TOO_LARGE);
  }

  const bytes = readFileSync(abs);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const filename = basename(abs);

  const res = await postMultipart(
    "/api/skill/v1/parse-resume",
    { resume: { filename, value: new File([blob], filename, { type: "application/pdf" }) } },
    record.accessToken,
  );

  if (res.status === 401 || res.status === 403) {
    console.error(JSON.stringify({ error: "unauthenticated" }));
    process.exit(EXIT.UNAUTHENTICATED);
  }
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    console.error(JSON.stringify({ error: "rate_limited", retry_after: retry }));
    process.exit(EXIT.RATE_LIMITED);
  }
  if (res.status === 413) {
    console.error(JSON.stringify({ error: "file_too_large" }));
    process.exit(EXIT.FILE_TOO_LARGE);
  }
  if (res.status === 415) {
    console.error(JSON.stringify({ error: "unsupported_media" }));
    process.exit(EXIT.UNSUPPORTED_MEDIA);
  }
  if (!res.ok) {
    console.error(`parse failed: HTTP ${res.status} ${JSON.stringify(res.payload)}`);
    process.exit(EXIT.GENERIC);
  }

  const { structured, report, pageCount, textSource } = res.payload;
  const dir = dirname(abs);
  const stem = filename.slice(0, -extname(filename).length);
  const jsonPath = uniqueOutputPath(join(dir, `${stem}.profile.json`));
  const mdPath = uniqueOutputPath(join(dir, `${stem}.report.md`));

  writeFileSync(jsonPath, JSON.stringify(structured, null, 2), "utf-8");
  writeFileSync(mdPath, report, "utf-8");

  console.log(
    JSON.stringify({
      input: abs,
      ok: true,
      output: { json: jsonPath, markdown: mdPath },
      pageCount,
      textSource,
    }),
  );
  process.exit(EXIT.OK);
}

// ---- entry ----------------------------------------------------------

function printUsage() {
  console.error(`Usage:
  node parse.mjs login              # interactive device-flow login
  node parse.mjs login --check      # exit 0 if authenticated, 2 otherwise
  node parse.mjs run <pdf-path>     # parse one PDF, write JSON + Markdown next to it

Env:
  RESUME_SKILL_BASE_URL   override backend (default ${DEFAULT_BASE_URL})
  RESUME_SKILL_CONFIG_DIR override token directory (default ~/.config/resume-parser-skill)`);
}

const args = process.argv.slice(2);
const [cmd, ...rest] = args;

if (cmd === "login") {
  await (rest.includes("--check") ? loginCheck() : loginInteractive());
} else if (cmd === "run") {
  const [target] = rest;
  if (!target) {
    printUsage();
    process.exit(EXIT.USAGE);
  }
  await runParse(target);
} else {
  printUsage();
  process.exit(EXIT.USAGE);
}
