// Runs the admin API locally (same code as the Cloudflare Worker) against the files in
// this folder instead of GitHub. Usage: node scripts/admin-dev.mjs  ->  http://localhost:8787
// Create a login first: node scripts/admin-user.mjs --dev --email you@example.com --name You
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import worker from "../worker/src/index.js";

const root = new URL("../", import.meta.url);
const dev = new URL(".admin-dev/", root);
await mkdir(dev, { recursive: true });
const PORT = Number(process.env.PORT) || 8787;

/** Same interface as GitHubStore, backed by the working tree. History lives in .admin-dev/. */
class LocalStore {
  historyFile = new URL("history.json", dev);
  async log() { return JSON.parse(await readFile(this.historyFile, "utf8").catch(() => "[]")); }
  async read(path, ref = "main") {
    if (ref !== "main") {
      const entry = (await this.log()).find((h) => h.sha.startsWith(ref));
      const text = entry?.files?.[path];
      return text == null ? null : { text, sha: createHash("sha1").update(text).digest("hex") };
    }
    const text = await readFile(new URL(path, root), "utf8").catch(() => null);
    return text == null ? null : { text, sha: createHash("sha1").update(text).digest("hex") };
  }
  async commit(files, message, author, expect = {}) {
    for (const [path, sha] of Object.entries(expect)) {
      if (((await this.read(path))?.sha || null) !== sha) throw Object.assign(new Error("Someone else saved a change a moment ago. Reload to see it, then try again."), { status: 409 });
    }
    const snap = {};
    for (const f of files) {
      const url = new URL(f.path, root);
      await mkdir(new URL("./", url), { recursive: true });
      if (f.base64) await writeFile(url, Buffer.from(f.base64, "base64"));
      else { await writeFile(url, f.text); snap[f.path] = f.text; }
    }
    const sha = randomBytes(20).toString("hex");
    const log = await this.log();
    log.unshift({ sha, message, author, date: new Date().toISOString(), files: snap });
    await writeFile(this.historyFile, JSON.stringify(log.slice(0, 50), null, 1));
    // Locally there is no GitHub Action, so rebuild availability.json + .ics right away.
    if (files.some((f) => f.path.startsWith("data/"))) spawnSync(process.execPath, [fileURLToPath(new URL("scripts/sync-calendars.mjs", root))], { stdio: "inherit" });
    return sha;
  }
  async history(path, limit = 20) {
    return (await this.log()).filter((h) => path in h.files).slice(0, limit).map(({ sha, message, author, date }) => ({ sha, message, author, date }));
  }
}

const secretFile = new URL("session-secret", dev);
let secret = await readFile(secretFile, "utf8").catch(() => "");
if (!secret) { secret = randomBytes(32).toString("hex"); await writeFile(secretFile, secret); }
const users = await readFile(new URL("users.json", dev), "utf8").catch(() => "[]");
if (users.trim() === "[]") console.warn("No admin logins yet. Create one: node scripts/admin-user.mjs --dev --email you@example.com --name You");

/** Stands in for a Cloudflare KV namespace: one JSON file in .admin-dev/ (git-ignored). */
class LocalKV {
  constructor(name) { this.file = new URL(`${name}.json`, dev); }
  async all() { return JSON.parse(await readFile(this.file, "utf8").catch(() => "{}")); }
  async get(k) { return (await this.all())[k] ?? null; }
  async put(k, v) { const a = await this.all(); a[k] = String(v); await writeFile(this.file, JSON.stringify(a, null, 1)); }
  async delete(k) { const a = await this.all(); delete a[k]; await writeFile(this.file, JSON.stringify(a, null, 1)); }
  async list({ prefix = "", limit = 1000 } = {}) { return { keys: Object.keys(await this.all()).filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) }; }
}

const env = {
  STORE: new LocalStore(),
  SUBMISSIONS: new LocalKV("submissions"),
  ADMIN_USERS: users,
  SESSION_SECRET: secret,
  ALLOWED_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080",
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const out = await worker.fetch(request, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, () => console.log(`Admin API (local) on http://localhost:${PORT}`));
