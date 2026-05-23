#!/usr/bin/env node
// Family OS — one-command setup
//
// Usage: `npm run setup` from the repo root.
// Asks two questions, installs deps, scaffolds your data/ folder, and writes
// app/.env. After this finishes you should be able to `npm start`.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(__dirname, "app");
const DATA = path.join(__dirname, "data");
const DATA_EXAMPLE = path.join(__dirname, "data.example");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const accent = (s) => `\x1b[36m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

async function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

function copyTree(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

function writeEnv(envPath, values) {
  let body = "";
  for (const [k, v] of Object.entries(values)) {
    body += `${k}=${v ?? ""}\n`;
  }
  fs.writeFileSync(envPath, body, "utf8");
}

(async () => {
  console.log("");
  console.log(bold(accent("  Family OS  ·  setup")));
  console.log(dim("  the cognitive Chief of Staff for the household"));
  console.log("");

  // 1) Node version sanity check
  const v = process.versions.node.split(".").map(Number);
  if (v[0] < 18 || (v[0] === 18 && v[1] < 17)) {
    console.error(`  Node ${process.versions.node} detected. Family OS needs Node 18.17+.`);
    process.exit(1);
  }

  // 2) Anthropic API key
  console.log("  1.  Anthropic API key");
  console.log(dim("      Get one at https://console.anthropic.com/settings/keys"));
  console.log(dim("      (~$0.05–0.12 per chat turn. Leave blank to fall back to a Claude Code session.)"));
  const apiKey = await ask("      ANTHROPIC_API_KEY > ");
  console.log("");

  // 3) Principal name
  console.log("  2.  Your first name");
  console.log(dim("      What the COS should call you in its own prompts. Defaults to 'the user'."));
  const name = await ask("      PRINCIPAL_NAME    > ");
  console.log("");

  // 4) Write app/.env
  const envPath = path.join(APP, ".env");
  writeEnv(envPath, {
    ANTHROPIC_API_KEY: apiKey,
    PRINCIPAL_NAME: name,
    MS_CLIENT_ID: "14d82eec-204b-4c2f-b7e8-296a70dab67e",
  });
  console.log(ok("  ✓") + ` wrote ${path.relative(__dirname, envPath)}`);

  // 5) Scaffold data/ from data.example/ if data/ doesn't exist
  if (!fs.existsSync(DATA) || fs.readdirSync(DATA).length === 0) {
    copyTree(DATA_EXAMPLE, DATA);
    console.log(ok("  ✓") + ` scaffolded ${path.relative(__dirname, DATA)}/ from data.example/`);
  } else {
    console.log(dim("  ·") + ` ${path.relative(__dirname, DATA)}/ already exists — leaving it alone`);
  }

  // 6) npm install in app/
  console.log("");
  console.log(dim("  installing app dependencies (this can take a minute)…"));
  console.log("");
  try {
    await run("npm", ["install", "--silent", "--no-fund", "--no-audit"], { cwd: APP });
    console.log(ok("  ✓") + " app dependencies installed");
  } catch (e) {
    console.error("  npm install failed:", e.message);
    process.exit(1);
  }

  // 7) Done
  console.log("");
  console.log(bold("  Setup complete."));
  console.log("");
  console.log("  Next:");
  console.log(`    ${accent("npm start")}       ${dim("# start the local server")}`);
  console.log(`    open ${accent("http://localhost:4317")}`);
  console.log("");
  if (!apiKey) {
    console.log(dim("  No ANTHROPIC_API_KEY was set. The Agent SDK will try to fall back to"));
    console.log(dim("  an existing Claude Code session on this machine. To use API-key auth,"));
    console.log(dim("  edit app/.env and add your key, then restart."));
    console.log("");
  }
  console.log("  Optional next step:");
  console.log(`    Open the app and click ${accent("Connect Outlook")} to wire up email +`);
  console.log("    calendar. Uses Microsoft's public Graph CLI client via device code — no");
  console.log("    Azure setup required.");
  console.log("");

  rl.close();
})();
