// CK Haven host admin API (Cloudflare Worker, free plan).
// The admin page (admin/ on GitHub Pages) calls this to log in and save changes.
// Every change is committed to the GitHub repo; GitHub Pages republishes in about a minute.
import { GitHubStore } from "./store-github.js";
import { checkPassword, hashPassword, signToken, verifyToken } from "./auth.js";
import { validateSite, validateBooking, checkImage } from "./validate.js";

const SITE = "data/site.json";
const BOOKINGS = "data/direct-bookings.json";
const AVAIL = "data/availability.json";
const DAY = 864e5;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status, message) => Object.assign(new Error(message), { status });
const pretty = (obj) => JSON.stringify(obj, null, 2) + "\n";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Max-Age": "600" }
      : {};
    let res;
    if (req.method === "OPTIONS") res = new Response(null, { status: 204 });
    else {
      try {
        res = await route(req, env);
      } catch (e) {
        const status = e.status || 500;
        if (status === 500) console.error(e);
        res = json({ error: status === 500 ? "Something went wrong on our side. Try again in a minute." : e.message }, status);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

const store = (env) => env.STORE || new GitHubStore({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || "main" });
const users = (env) => { try { return JSON.parse(env.ADMIN_USERS || "[]"); } catch { return []; } };

async function body(req) {
  if (!(req.headers.get("Content-Type") || "").includes("application/json")) throw fail(415, "Expected JSON.");
  try { return await req.json(); } catch { throw fail(400, "That request was garbled."); }
}

async function route(req, env) {
  const { pathname } = new URL(req.url);
  const m = req.method;
  if (pathname === "/" || pathname === "/api/health") return json({ ok: true, service: "ckhaven-admin" });
  if (m === "POST" && pathname === "/api/login") return login(req, env);

  const user = await requireUser(req, env);
  const s = store(env);
  if (m === "GET" && pathname === "/api/me") return json({ user });
  if (m === "GET" && pathname === "/api/data") return getData(s);
  if (m === "PUT" && pathname === "/api/site") return saveSite(req, s, user);
  if (m === "POST" && pathname === "/api/bookings") return addBooking(req, s, user);
  if (m === "DELETE" && pathname === "/api/bookings") return removeBooking(req, s, user);
  if (m === "POST" && pathname === "/api/photos") return uploadPhoto(req, s, user);
  if (m === "GET" && pathname === "/api/history") return json({ changes: await s.history(SITE, 25) });
  if (m === "POST" && pathname === "/api/restore") return restore(req, s, user);
  throw fail(404, "Not found.");
}

// ---------------- auth ----------------
const attempts = new Map(); // fallback when no KV namespace is bound (per-instance only)
async function rateLimit(env, key, max, seconds) {
  const now = Date.now();
  if (env.RATE) {
    const n = Number(await env.RATE.get(key)) || 0;
    if (n >= max) throw fail(429, "Too many tries. Wait 15 minutes and try again.");
    await env.RATE.put(key, String(n + 1), { expirationTtl: seconds });
    return;
  }
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= max) throw fail(429, "Too many tries. Wait 15 minutes and try again.");
  attempts.set(key, a && a.until > now ? { ...a, n: a.n + 1 } : { n: 1, until: now + seconds * 1000 });
}

let dummy; // makes an unknown email take as long as a wrong password
async function login(req, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw fail(500, "SESSION_SECRET is not set.");
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  await rateLimit(env, `login:${ip}`, 10, 900);
  const { email, password } = await body(req);
  const u = users(env).find((x) => x.email.toLowerCase() === String(email || "").trim().toLowerCase());
  dummy ||= await hashPassword("not-a-real-password");
  const ok = await checkPassword(String(password || ""), u || dummy);
  if (!u || !ok) throw fail(401, "That email and password don't match.");
  const role = u.role === "cohost" ? "cohost" : "owner";
  const token = await signToken(env.SESSION_SECRET, { e: u.email, x: Date.now() + 30 * DAY });
  return json({ token, user: { email: u.email, name: u.name, role } });
}

async function requireUser(req, env) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const payload = token && env.SESSION_SECRET ? await verifyToken(env.SESSION_SECRET, token).catch(() => null) : null;
  // Look the person up every time, so removing someone from ADMIN_USERS locks them out at once.
  const u = payload && users(env).find((x) => x.email.toLowerCase() === payload.e.toLowerCase());
  if (!u) throw fail(401, "Please log in again.");
  return { email: u.email, name: u.name, role: u.role === "cohost" ? "cohost" : "owner" };
}
const ownerOnly = (user) => { if (user.role !== "owner") throw fail(403, "Only the owner can change this. Co-hosts can manage the calendar."); };

// ---------------- data ----------------
async function getData(s) {
  const [site, bookings, avail] = await Promise.all([s.read(SITE), s.read(BOOKINGS), s.read(AVAIL)]);
  if (!site) throw fail(500, "site.json is missing.");
  return json({
    site: JSON.parse(site.text), siteSha: site.sha,
    bookings: bookings ? JSON.parse(bookings.text) : [], bookingsSha: bookings?.sha || null,
    availability: avail ? JSON.parse(avail.text) : { properties: {} },
  });
}

async function saveSite(req, s, user) {
  ownerOnly(user);
  const { site, sha, message } = await body(req);
  validateSite(site);
  const summary = String(message || "Update site details").replace(/\s+/g, " ").slice(0, 80);
  await s.commit([{ path: SITE, text: pretty(site) }], `${summary} (by ${user.name})`, user.name, { [SITE]: sha });
  const fresh = await s.read(SITE);
  return json({ ok: true, siteSha: fresh.sha });
}

async function loadBookings(s) {
  const [siteF, bookF] = await Promise.all([s.read(SITE), s.read(BOOKINGS)]);
  return { site: JSON.parse(siteF.text), list: bookF ? JSON.parse(bookF.text) : [], sha: bookF?.sha || null };
}

async function addBooking(req, s, user) {
  const { site, list, sha } = await loadBookings(s);
  const b = validateBooking(await body(req), site);
  if (list.some((x) => x.property === b.property && b.start < x.end && x.start < b.end)) throw fail(409, "Those dates overlap a booking you already added.");
  list.push(b);
  list.sort((a, c) => a.start.localeCompare(c.start));
  await s.commit([{ path: BOOKINGS, text: pretty(list) }], `Block ${b.start} to ${b.end} (by ${user.name})`, user.name, { [BOOKINGS]: sha });
  return json({ ok: true, bookings: list });
}

async function removeBooking(req, s, user) {
  const { list, sha } = await loadBookings(s);
  const { property, start, end } = await body(req);
  const next = list.filter((x) => !(x.property === property && x.start === start && x.end === end));
  if (next.length === list.length) throw fail(404, "That booking was already removed.");
  await s.commit([{ path: BOOKINGS, text: pretty(next) }], `Unblock ${start} to ${end} (by ${user.name})`, user.name, { [BOOKINGS]: sha });
  return json({ ok: true, bookings: next });
}

// ---------------- photos ----------------
async function uploadPhoto(req, s, user) {
  ownerOnly(user);
  const { name, jpg, large, small } = await body(req);
  checkImage(jpg, "jpg");
  const ext = checkImage(large, "variant");
  if (checkImage(small, "variant") !== ext) throw fail(400, "Photo sizes didn't match. Try again.");
  const slug = String(name || "photo").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
  const base = `assets/img/u/${slug}-${Date.now().toString(36)}`;
  await s.commit([
    { path: `${base}.jpg`, base64: jpg },
    { path: `${base}-1280.${ext}`, base64: large },
    { path: `${base}-640.${ext}`, base64: small },
  ], `Add photo ${slug} (by ${user.name})`, user.name);
  return json({ ok: true, src: `${base}.jpg`, webp: ext === "webp" });
}

// ---------------- history ----------------
async function restore(req, s, user) {
  ownerOnly(user);
  const { sha, label } = await body(req);
  const what = typeof label === "string" && label.trim() ? `“${label.trim().replace(/\s+/g, " ").slice(0, 80)}”` : `version ${String(sha).slice(0, 7)}`;
  if (!/^[0-9a-f]{7,64}$/i.test(sha || "")) throw fail(400, "Unknown version.");
  const old = await s.read(SITE, sha);
  if (!old) throw fail(404, "That version can't be found.");
  validateSite(JSON.parse(old.text));
  const cur = await s.read(SITE);
  await s.commit([{ path: SITE, text: old.text }], `Went back to ${what} (by ${user.name})`, user.name, { [SITE]: cur.sha });
  return json({ ok: true });
}
