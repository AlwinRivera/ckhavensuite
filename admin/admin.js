// CK Haven host admin. Structured editing like a host app: Today, Calendar, Listing,
// Website and Changes. Saves go to the admin API, which commits to GitHub.
import { $, $$, esc, money, plural, monthHTML, todayISO, pretty, nightsBetween, addDays, icons, toast as baseToast, timeAgo } from "../js/common.js";

// ---------------- setup ----------------
const TOKEN_KEY = "ckhaven-admin-token";
const S = { token: load(TOKEN_KEY), user: null, site: null, siteSha: null, bookings: [], avail: { properties: {} }, tab: "today", prop: null, cal: {} };
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const app = $("#app");
const names = { airbnb: "Airbnb", booking: "Booking.com", direct: "Direct" };
const today = todayISO();
const siteBase = () => (S.site?.siteUrl ? S.site.siteUrl.replace(/\/?$/, "/") : new URL("../", location.href).href);
const prop = () => S.site.properties.find((p) => p.id === S.prop) || S.site.properties[0];
const isOwner = () => S.user?.role === "owner";
const clone = (o) => structuredClone(o);

// ---------------- demo mode ----------------
// admin/?demo (or "Try the demo" on the login screen) runs the whole admin in this browser tab:
// no login, no admin service, and nothing reaches the real website. Changes last until the tab closes.
const DEMO_KEY = "ckhaven-admin-demo";
let DEMO = new URLSearchParams(location.search).has("demo") || loadSession(DEMO_KEY) != null;
function loadSession(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function saveSession(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} }
// Toasts promise "live in a minute"; in the demo, say plainly that nothing was published.
const toast = (m) => baseToast(DEMO ? String(m).replace(/ ?(It's live on the website in about a minute|Live on the website in about a minute|The website updates in a couple of minutes; Airbnb and Booking.com on their next calendar check)./, " Demo only: the real website isn't changed.") : m);
const D = { user: { email: "demo@ckhaven", name: "Khandy", role: "owner" } };
const sha = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join("");
async function demoState() {
  if (D.state) return D.state;
  const saved = loadSession(DEMO_KEY);
  if (saved) { try { return (D.state = JSON.parse(saved)); } catch {} }
  const get = (f, fallback) => fetch(`../data/${f}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);
  const [site, bookings, availability] = await Promise.all([get("site.json", null), get("direct-bookings.json", []), get("availability.json", { properties: {} })]);
  const first = { sha: sha(), message: "Website as it is today", author: "CK Haven", date: new Date().toISOString(), site };
  return (D.state = { site, siteSha: first.sha, bookings, availability, history: [first] });
}
const keep = () => saveSession(DEMO_KEY, JSON.stringify(D.state));
async function demoApi(method, path, b = {}) {
  const st = await demoState();
  if (!st.site) throw new Error("Couldn't load the website details for the demo.");
  const commit = (message) => { const c = { sha: sha(), message, author: D.user.name, date: new Date().toISOString(), site: clone(st.site) }; st.history.unshift(c); st.siteSha = c.sha; keep(); return c.sha; };
  const key = `${method} ${path}`;
  if (key === "POST /api/login" || key === "GET /api/me") return { token: "demo", user: D.user };
  if (key === "GET /api/data") return { site: clone(st.site), siteSha: st.siteSha, bookings: clone(st.bookings), availability: clone(st.availability) };
  if (key === "PUT /api/site") { st.site = clone(b.site); return { ok: true, siteSha: commit(b.message || "Update site details") }; }
  if (key === "POST /api/bookings") {
    if (st.bookings.some((x) => x.property === b.property && b.start < x.end && x.start < b.end)) throw new Error("Those dates overlap a booking you already added.");
    st.bookings.push({ property: b.property, start: b.start, end: b.end, label: b.label || "" });
    st.bookings.sort((a, c) => a.start.localeCompare(c.start)); keep();
    return { ok: true, bookings: clone(st.bookings) };
  }
  if (key === "DELETE /api/bookings") { st.bookings = st.bookings.filter((x) => !(x.property === b.property && x.start === b.start && x.end === b.end)); keep(); return { ok: true, bookings: clone(st.bookings) }; }
  if (key === "POST /api/photos") return { ok: true, src: `assets/img/u/demo-${Date.now().toString(36)}.jpg` };
  if (key === "GET /api/history") return { changes: st.history.map(({ site, ...c }) => c) };
  if (key === "POST /api/restore") {
    const old = st.history.find((c) => c.sha === b.sha);
    if (!old) throw new Error("That version can't be found.");
    st.site = clone(old.site); commit(`Went back to “${b.label || "an earlier version"}”`);
    return { ok: true };
  }
  throw new Error("Not available in the demo.");
}
function startDemo() { DEMO = true; saveSession(DEMO_KEY, ""); S.token = "demo"; boot(); }

let API = new URLSearchParams(location.search).get("api");
if (!API && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = "http://localhost:8787";
if (!API) API = await fetch("../data/site.json").then((r) => r.json()).then((s) => s.adminApi).catch(() => "");

async function api(method, path, body) {
  if (DEMO) return demoApi(method, path, body);
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the admin service. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") { logout(); throw new Error("Please log in again."); }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

// ---------------- login ----------------
function showLogin(msg = "") {
  app.innerHTML = `
    <main class="login">
      <form class="login-card" id="login">
        <a class="logo" href="../index.html"><img src="../assets/brand/logo-mark.png" alt=""><span><span class="word">CK Haven</span><span class="sub">Host</span></span></a>
        <h1>Log in to manage your stays</h1>
        <p class="muted small" style="margin:0 0 20px">Calendar, prices, photos and everything guests see.</p>
        <label class="fld"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="fld"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
        <div class="login-err" role="alert">${esc(msg)}</div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Log in</button>
        <p class="hint" style="margin:16px 0 0">Forgot your password? Ask the site admin to set a new one.</p>
        <div class="login-demo"><span>Just looking?</span><button type="button" class="btn btn-soft btn-block" data-demo>Try the demo, no login</button><p class="hint">Everything works, but nothing you change reaches the real website.</p></div>
      </form>
    </main>`;
  $("[data-demo]").addEventListener("click", startDemo);
  if (!API) { $(".login-err").textContent = "Logins aren't switched on yet. Use the demo below to look around."; return; }
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Logging in…";
    try {
      const r = await api("POST", "/api/login", { email: f.email.value, password: f.password.value });
      S.token = r.token; S.user = r.user; save(TOKEN_KEY, r.token);
      await boot();
    } catch (err) {
      $(".login-err").textContent = err.message;
      btn.disabled = false; btn.textContent = "Log in";
    }
  });
  $("#login [name=email]").focus();
}
function logout() {
  if (ed.dlg.open) { ed.dirty = false; ed.dlg.close(); }
  Object.assign(S, { token: null, user: null, tab: "today", cal: {} });
  if (DEMO) { DEMO = false; D.state = null; saveSession(DEMO_KEY, null); if (location.search.includes("demo")) history.replaceState(null, "", location.pathname); }
  else save(TOKEN_KEY, null); // leaving the demo keeps any real login saved on this device
  showLogin();
}

async function boot() {
  if (DEMO) S.token = "demo";
  if (!S.token) return showLogin();
  try {
    const [me, data] = await Promise.all([api("GET", "/api/me"), api("GET", "/api/data")]);
    S.user = me.user;
    setData(data);
    if (!S.site.properties.some((p) => p.id === S.prop)) S.prop = S.site.properties[0].id;
    if (!TABS.some(([k, , , ownerOnly]) => k === S.tab && (!ownerOnly || isOwner()))) S.tab = "today";
    shell();
  } catch (err) {
    if (S.token) showLogin(err.message);
  }
}
function setData(d) { S.site = d.site; S.siteSha = d.siteSha; S.bookings = d.bookings; S.avail = d.availability; }
async function refresh() { setData(await api("GET", "/api/data")); }

// ---------------- shell ----------------
const TABS = [
  ["today", "Today", icons.home],
  ["calendar", "Calendar", icons.cal],
  ["listing", "Listing", icons.grid, true],
  ["website", "Website", icons.spark, true],
  ["changes", "Changes", icons.clock, true],
];
function tabsHTML(cls) {
  return `<nav class="ad-tabs ${cls}" aria-label="Sections">${TABS.filter((t) => !t[3] || isOwner()).map(([k, l, ic]) => `<button type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${ic}<span>${l}</span></button>`).join("")}</nav>`;
}
function shell() {
  const u = S.user;
  app.innerHTML = `${DEMO ? `<div class="demo-bar" role="status"><b>Demo</b> Try anything: changes stay in this browser tab and never reach the real website. <button class="u" data-logout>Leave the demo</button></div>` : ""}
    <header class="ad-top"><div class="bar">
      <a class="logo" href="../index.html" target="_blank" rel="noopener" title="Open the website"><img src="../assets/brand/logo-mark.png" alt=""><span><span class="word">CK Haven</span><span class="sub">Host</span></span></a>
      ${tabsHTML("")}
      <div class="ad-user"><span class="who"><b>${esc(u.name)}</b> <span class="muted">· ${u.role === "owner" ? "Owner" : "Co-host"}</span></span><div class="avatar">${esc(u.name[0])}</div><button class="u small" data-logout>Log out</button></div>
    </div></header>
    <main class="ad-main" id="view"></main>
    ${tabsHTML("bottom")}
    <div class="ad-bar" id="bar" hidden></div>`;
  render();
}
app.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (t) { S.tab = t.dataset.tab; S.cal = {}; shell(); scrollTo(0, 0); return; }
  if (e.target.closest("[data-logout]")) return logout();
  const p = e.target.closest("[data-prop]");
  if (p) { S.prop = p.dataset.prop; S.cal = {}; render(); }
});
function render() {
  $("#bar").hidden = true;
  ({ today: renderToday, calendar: renderCalendar, listing: renderListing, website: renderWebsite, changes: renderChanges })[S.tab]();
}
const propChips = () => S.site.properties.length > 1
  ? `<div class="chips" role="group" aria-label="Property">${S.site.properties.map((p) => `<button type="button" data-prop="${esc(p.id)}" aria-pressed="${p.id === prop().id}">${esc(p.name)}</button>`).join("")}</div>` : "";

// ---------------- bookings (all channels) ----------------
/** Airbnb/Booking.com nights from the hourly sync + direct ones straight from the saved list (always fresh). */
function events(id) {
  const synced = (S.avail.properties?.[id]?.booked || []).filter((b) => b.source !== "direct");
  const direct = S.bookings.filter((b) => b.property === id).map((b) => ({ ...b, source: "direct" }));
  return [...synced, ...direct].sort((a, b) => a.start.localeCompare(b.start));
}
function nightMap(id) {
  const m = new Map();
  for (const b of events(id)) for (let d = b.start; d < b.end; d = addDays(d, 1)) m.set(d, b);
  return m;
}

// ---------------- Today ----------------
function renderToday() {
  const hr = new Date().getHours();
  const all = S.site.properties.flatMap((p) => events(p.id).map((b) => ({ ...b, unit: p.name })));
  const ins = all.filter((b) => b.start === today), outs = all.filter((b) => b.end === today);
  const staying = all.filter((b) => b.start <= today && b.end > today);
  const upcoming = all.filter((b) => b.end > today).slice(0, 12);
  const nights30 = S.site.properties.reduce((n, p) => n + [...nightMap(p.id).keys()].filter((d) => d >= today && nightsBetween(today, d) < 30).length, 0);
  const missing = S.site.properties.flatMap((p) => Object.entries(p.channels || {}).filter(([, c]) => c.url && !c.ical).map(([k]) => `${names[k] || k} (${p.name})`));
  const unconfirmed = S.site.properties.flatMap((p) => Object.entries(p.stayTypes).filter(([, st]) => !st.confirmed).map(([t]) => `${t === "monthly" ? "Monthly" : "Nightly"} rate (${p.name})`));
  const wd = { weekday: "short", month: "short", day: "numeric" };
  $("#view").innerHTML = `
    <h1>Good ${hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"}, ${esc(S.user.name.split(" ")[0])}</h1>
    <p class="ad-sub">${S.avail.updated ? `Bookings last changed ${timeAgo(S.avail.updated)}. Airbnb and Booking.com calendars are checked every hour.` : "Calendars are checked every hour."}</p>
    ${isOwner() && (missing.length || unconfirmed.length) ? `<div class="notice"><b>To finish setting up</b><ul style="margin:6px 0 0;padding-left:18px">
      ${missing.map((m) => `<li>Add the calendar link for ${esc(m)} in <button class="u" data-tab="listing">Listing → Booking links</button></li>`).join("")}
      ${unconfirmed.map((m) => `<li>Confirm the ${esc(m)} in <button class="u" data-tab="listing">Listing → Pricing</button> so guests see exact totals</li>`).join("")}
    </ul></div>` : ""}
    <div class="today-cards">
      ${[["Checking in today", ins.length ? ins.map((b) => names[b.source]).join(", ") : "No one"],
         ["Checking out today", outs.length ? outs.map((b) => names[b.source]).join(", ") : "No one"],
         ["Currently hosting", staying.length ? staying.map((b) => `until ${pretty(b.end)}`).join(", ") : "All free"],
         ["Booked, next 30 nights", `${Math.round((nights30 / (30 * S.site.properties.length)) * 100)}%`]].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("")}
    </div>
    <section class="panel">
      <h2 style="font-size:1.2rem">Upcoming</h2>
      <table class="list"><tr><th>Where</th><th>From</th><th>Check in</th><th>Check out</th><th>Nights</th></tr>
        ${upcoming.map((b) => `<tr><td>${esc(b.unit)}</td><td><span class="dot" style="background:var(--${b.source})"></span> ${names[b.source]}${b.label && b.source === "direct" ? ` <span class="muted xs">${esc(b.label)}</span>` : ""}</td><td>${pretty(b.start, wd)}</td><td>${pretty(b.end, wd)}</td><td>${nightsBetween(b.start, b.end)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nothing booked yet.</td></tr>`}
      </table>
      <p style="margin:16px 0 0"><button class="btn btn-dark btn-sm" data-tab="calendar">Open calendar</button></p>
    </section>
    <section class="panel">
      <h2 style="font-size:1.2rem">Calendar sync</h2>
      <table class="list">${S.site.properties.flatMap((p) => Object.entries(S.avail.properties?.[p.id]?.channels || {}).map(([k, v]) => `<tr><td>${esc(p.name)} · ${names[k] || esc(k)}</td><td class="status-${esc(v)}">${{ ok: "Synced", error: "Couldn't read the calendar link. Check it.", "not-configured": "No calendar link yet", demo: "Sample data (demo mode)" }[v] || esc(v)}</td></tr>`)).join("") || `<tr><td class="muted">No channels yet.</td></tr>`}</table>
    </section>`;
}

// ---------------- Calendar ----------------
function renderCalendar() {
  const p = prop();
  const nights = nightMap(p.id);
  const c = S.cal;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
  const dayClass = (d) => {
    const b = nights.get(d);
    const cls = [];
    if (b) cls.push(`src-${b.source}`);
    if (c.picked && b === c.picked) cls.push("mine");
    if (c.start && d === c.start) cls.push("pick");
    if (c.start && c.end && d > c.start && d < c.end) cls.push("pick-range");
    if (c.end && d === c.end) cls.push("pick");
    if (d < today) cls.push("past");
    if (d === today) cls.push("today");
    return { cls: cls.join(" "), disabled: d < today, title: b ? (b.source === "direct" ? b.label || "Direct booking" : `Booked on ${names[b.source]}`) : "" };
  };
  $("#view").innerHTML = `
    <h1>Calendar</h1>
    <p class="ad-sub">Tap a start date and an end date to block nights for a direct booking or a break. Airbnb and Booking.com bookings come in by themselves.</p>
    ${propChips()}
    <div class="legend"><span><span class="dot" style="background:var(--airbnb)"></span>Airbnb</span><span><span class="dot" style="background:var(--booking)"></span>Booking.com</span><span><span class="dot" style="background:var(--direct)"></span>Direct or blocked</span></div>
    <section class="panel"><div class="ad-cal">${months.map((m) => monthHTML(m.getFullYear(), m.getMonth(), dayClass)).join("")}</div></section>
    <section class="panel">
      <h2 style="font-size:1.2rem">Your calendar link</h2>
      <p class="muted small">Paste this into Airbnb (Calendar → Availability → Connect calendars → Import) and Booking.com (Rates & availability → Sync calendars) so they block your direct bookings too.</p>
      <div class="copy"><code>${esc(siteBase())}ical/${esc(p.id)}.ics</code><button class="mini" data-copy="${esc(siteBase())}ical/${esc(p.id)}.ics">Copy</button></div>
    </section>`;
  renderBar();
}
function renderBar() {
  const bar = $("#bar"), c = S.cal, p = prop();
  if (c.picked) {
    bar.hidden = false;
    bar.innerHTML = `<div class="what"><b>${pretty(c.picked.start)} – ${pretty(c.picked.end)} · ${plural(nightsBetween(c.picked.start, c.picked.end), "night")}</b><span class="muted small">${esc(c.picked.label || "Direct booking")}</span></div>
      <button class="btn btn-soft btn-sm" data-cal-cancel>Close</button><button class="btn btn-dark btn-sm" data-cal-unblock>Unblock these nights</button>`;
  } else if (c.start && !c.end) {
    bar.hidden = false;
    bar.innerHTML = `<div class="what"><b>From ${pretty(c.start, { weekday: "short", month: "short", day: "numeric" })}</b><span class="muted small">Now tap the checkout day (the morning they leave)</span></div><button class="btn btn-soft btn-sm" data-cal-cancel>Cancel</button>`;
  } else if (c.start && c.end) {
    bar.hidden = false;
    bar.innerHTML = `<div class="what"><b>${pretty(c.start)} – ${pretty(c.end)} · ${plural(nightsBetween(c.start, c.end), "night")}</b>
      <select id="block-label" aria-label="Reason"><option>Direct booking</option><option>Blocked (not available)</option></select></div>
      <button class="btn btn-soft btn-sm" data-cal-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-cal-block>Block dates</button>`;
  } else bar.hidden = true;
  void p;
}
app.addEventListener("click", async (e) => {
  if (S.tab !== "calendar") return;
  const day = e.target.closest(".ad-cal .day");
  const c = S.cal;
  if (day && !day.disabled) {
    const d = day.dataset.date;
    const b = nightMap(prop().id).get(d);
    if (b && b.source !== "direct" && !(c.start && !c.end && d > c.start)) { toast(`Booked on ${names[b.source]}. Change it on ${names[b.source]}.`); return; }
    if (c.start && !c.end && d > c.start) {
      // choosing the end: every night in between must be free (the checkout morning may be someone's check-in)
      const nights = nightMap(prop().id);
      for (let x = c.start; x < d; x = addDays(x, 1)) if (nights.has(x)) return toast("Some nights in between are already booked. Pick an earlier end date.");
      c.end = d;
    } else if (b && b.source === "direct") {
      S.cal = { picked: b };
    } else {
      S.cal = { start: d };
    }
    return renderCalendar();
  }
  if (e.target.closest("[data-cal-cancel]")) { S.cal = {}; return renderCalendar(); }
  const blockBtn = e.target.closest("[data-cal-block]");
  if (blockBtn) {
    blockBtn.disabled = true; blockBtn.textContent = "Saving…";
    try {
      const r = await api("POST", "/api/bookings", { property: prop().id, start: c.start, end: c.end, label: $("#block-label").value });
      S.bookings = r.bookings; S.cal = {};
      toast("Blocked. The website updates in a couple of minutes; Airbnb and Booking.com on their next calendar check.");
    } catch (err) { toast(err.message); }
    return renderCalendar();
  }
  const un = e.target.closest("[data-cal-unblock]");
  if (un) {
    if (!confirm(`Unblock ${pretty(c.picked.start)} – ${pretty(c.picked.end)}? Guests will be able to request these nights again.`)) return;
    un.disabled = true;
    try {
      const r = await api("DELETE", "/api/bookings", { property: c.picked.property, start: c.picked.start, end: c.picked.end });
      S.bookings = r.bookings; S.cal = {};
      toast("Unblocked.");
    } catch (err) { toast(err.message); }
    return renderCalendar();
  }
});
document.addEventListener("click", async (e) => {
  const cp = e.target.closest("[data-copy]");
  if (!cp) return;
  try { await navigator.clipboard.writeText(cp.dataset.copy); toast("Copied."); } catch { toast("Couldn't copy. Press and hold the link to copy it."); }
});

// ---------------- form engine ----------------
// Field: { k: "path.to.value", label, type, hint, ... }. Types: text, textarea, number, check,
// lines (one per line), paras (blank line between), select, list (array of objects), present (optional object).
const F = (k, label, type = "text", extra = {}) => ({ k, label, type, ...extra });
const getP = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function setP(o, path, v) {
  const ks = path.split(".");
  let x = o;
  ks.slice(0, -1).forEach((k, i) => { if (x[k] == null || typeof x[k] !== "object") x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; });
  x[ks.at(-1)] = v;
}
function delP(o, path) {
  const ks = path.split(".");
  const parent = getP(o, ks.slice(0, -1).join(".")) ?? (ks.length === 1 ? o : null);
  if (parent) delete parent[ks.at(-1)];
}
const join = (base, k) => (base ? `${base}.${k}` : k);

function fieldsHTML(fields, obj, base = "") {
  return fields.map((f) => {
    if (f.type === "row") return `<div class="fld-row">${fieldsHTML(f.fields, obj, base)}</div>`;
    if (f.type === "info") return `<div class="fld">${f.html(obj)}</div>`;
    const path = join(base, f.k);
    const v = getP(obj, path);
    const hint = f.hint ? `<small>${f.hint}</small>` : "";
    const attrs = `data-path="${esc(path)}" data-type="${f.type}"`;
    switch (f.type) {
      case "check":
        return `<label class="fld-check"><input type="checkbox" ${attrs} ${v ? "checked" : ""}><span>${esc(f.label)}${f.hint ? `<br><small class="hint">${f.hint}</small>` : ""}</span></label>`;
      case "textarea":
        return `<label class="fld"><span>${esc(f.label)}</span><textarea ${attrs} rows="${f.rows || 4}">${esc(v ?? "")}</textarea>${hint}</label>`;
      case "lines":
        return `<label class="fld"><span>${esc(f.label)}</span><textarea ${attrs} rows="${f.rows || 5}">${esc((v || []).join("\n"))}</textarea>${hint || "<small>One per line.</small>"}</label>`;
      case "paras":
        return `<label class="fld"><span>${esc(f.label)}</span><textarea ${attrs} rows="${f.rows || 10}">${esc((v || []).join("\n\n"))}</textarea>${hint || "<small>Leave a blank line between paragraphs.</small>"}</label>`;
      case "number":
        return `<label class="fld"><span>${esc(f.label)}</span><input type="number" inputmode="decimal" step="${f.step || "any"}" min="${f.min ?? 0}" ${attrs} value="${esc(v ?? "")}">${hint}</label>`;
      case "select": {
        const opts = typeof f.options === "function" ? f.options(obj) : f.options;
        return `<label class="fld"><span>${esc(f.label)}</span><select ${attrs}>${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(v ?? "") === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>${hint}</label>`;
      }
      case "list": {
        const arr = v || [];
        return `<div class="fl-list"><div class="fl-label">${esc(f.label)}</div>${f.hint ? `<p class="hint" style="margin:-4px 0 10px">${f.hint}</p>` : ""}
          ${arr.map((item, i) => `<div class="fl-item"><div class="fl-bar"><b>${esc(f.itemLabel ? f.itemLabel(item, i) : `#${i + 1}`)}</b><span>
            <button type="button" class="mini" data-list-move="${esc(path)}" data-i="${i}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
            <button type="button" class="mini" data-list-move="${esc(path)}" data-i="${i}" data-d="1" ${i === arr.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
            <button type="button" class="mini danger" data-list-del="${esc(path)}" data-i="${i}">Remove</button></span></div>
            ${fieldsHTML(f.fields, obj, `${path}.${i}`)}</div>`).join("")}
          <button type="button" class="add-btn" data-list-add="${esc(path)}">+ ${esc(f.addLabel || "Add")}</button></div>`;
      }
      case "present":
        return `<div class="fld-group"><label class="fld-check"><input type="checkbox" data-present="${esc(path)}" ${v ? "checked" : ""}><span>${esc(f.label)}</span></label>${v ? fieldsHTML(f.fields, obj, path) : ""}</div>`;
      default:
        return `<label class="fld"><span>${esc(f.label)}</span><input type="${f.input || "text"}" ${attrs} value="${esc(v ?? "")}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}>${hint}</label>`;
    }
  }).join("");
}
function readVal(el) {
  const t = el.dataset.type;
  if (t === "check") return el.checked;
  if (t === "number") return el.value === "" ? 0 : Number(el.value);
  if (t === "lines") return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (t === "paras") return el.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return el.value;
}
function findField(fields, path, base = "") {
  for (const f of fields) {
    if (f.type === "row") { const r = findField(f.fields, path, base); if (r) return r; continue; }
    const p = join(base, f.k);
    if (p === path) return f;
    if ((f.type === "list" || f.type === "present") && path.startsWith(p + ".")) {
      const rest = f.type === "list" ? path.slice(p.length + 1).replace(/^\d+\.?/, "") : path.slice(p.length + 1);
      const sub = f.type === "list" ? `${p}.${path.slice(p.length + 1).split(".")[0]}` : p;
      if (!rest) return null;
      const r = findField(f.fields, path, sub); if (r) return r;
    }
  }
  return null;
}

// ---------------- editor sheet ----------------
const ed = { dlg: $("#editor"), draft: null, dirty: false, section: null, scope: null };
function openEditor(section, scope) {
  ed.section = section; ed.scope = scope; ed.dirty = false; phOpen = null;
  ed.draft = clone(scope === "site" ? S.site : prop());
  $("#ed-title").textContent = section.title;
  $("#ed-status").textContent = "";
  drawEditor();
  ed.dlg.showModal();
  ed.dlg.scrollTop = 0; $("#ed-body").scrollTop = 0;
}
function drawEditor() {
  const top = $("#ed-body").scrollTop;
  $("#ed-body").innerHTML = (ed.section.intro ? `<p class="muted small" style="margin-top:0">${ed.section.intro}</p>` : "") + (ed.section.custom ? ed.section.custom(ed.draft) : fieldsHTML(ed.section.fields, ed.draft));
  $("#ed-body").scrollTop = top;
}
const markDirty = () => { ed.dirty = true; $("#ed-status").textContent = "Unsaved changes"; };
$("#ed-body").addEventListener("input", (e) => {
  const el = e.target.closest("[data-path]");
  if (!el) return;
  setP(ed.draft, el.dataset.path, readVal(el));
  markDirty();
});
$("#ed-body").addEventListener("change", (e) => {
  const pr = e.target.closest("[data-present]");
  if (pr) {
    const f = findPresent(ed.section.fields || [], pr.dataset.present);
    if (pr.checked) setP(ed.draft, pr.dataset.present, clone(f?.def || {}));
    else delP(ed.draft, pr.dataset.present);
    markDirty(); drawEditor(); return;
  }
  const el = e.target.closest("select[data-path]");
  if (el) { setP(ed.draft, el.dataset.path, readVal(el)); markDirty(); }
});
function findPresent(fields, path) {
  for (const f of fields) {
    if (f.type === "row") { const r = findPresent(f.fields, path); if (r) return r; }
    if (f.type === "present" && f.k === path) return f;
  }
  return null;
}
$("#ed-body").addEventListener("click", (e) => {
  const add = e.target.closest("[data-list-add]");
  if (add) {
    const path = add.dataset.listAdd;
    const f = findField(ed.section.fields || [], path);
    const arr = getP(ed.draft, path) || [];
    arr.push(clone(f?.def ?? {}));
    setP(ed.draft, path, arr);
    markDirty(); drawEditor(); return;
  }
  const del = e.target.closest("[data-list-del]");
  if (del) { getP(ed.draft, del.dataset.listDel).splice(Number(del.dataset.i), 1); markDirty(); drawEditor(); return; }
  const mv = e.target.closest("[data-list-move]");
  if (mv) {
    const arr = getP(ed.draft, mv.dataset.listMove), i = Number(mv.dataset.i), j = i + Number(mv.dataset.d);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    markDirty(); drawEditor();
  }
});
function closeEditor() {
  if (ed.dirty && !confirm("Discard your changes?")) return;
  ed.dlg.close();
}
$$("[data-ed-close]").forEach((b) => b.addEventListener("click", closeEditor));
// Only Esc on the sheet itself: a cancelled file picker also fires a bubbling "cancel" from its <input>.
ed.dlg.addEventListener("cancel", (e) => { if (e.target !== ed.dlg) return; e.preventDefault(); closeEditor(); });
$("[data-ed-close].x").innerHTML = icons.x;

$("#ed-save").addEventListener("click", async () => {
  const btn = $("#ed-save");
  if (ed.section.check) { const msg = ed.section.check(ed.draft); if (msg) return toast(msg); }
  let next;
  if (ed.scope === "site") next = ed.draft;
  else { next = clone(S.site); next.properties[next.properties.findIndex((p) => p.id === S.prop)] = ed.draft; }
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Update ${ed.section.title.toLowerCase()}${ed.scope === "site" ? "" : ` · ${ed.draft.name}`}` });
    S.site = next; S.siteSha = r.siteSha;
    if (ed.draft.id && ed.scope !== "site") S.prop = ed.draft.id;
    ed.dirty = false; ed.dlg.close();
    toast("Saved. It's live on the website in about a minute.");
    render();
  } catch (err) {
    toast(err.message);
    $("#ed-status").textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = "Save"; }
});

// ---------------- photos editor (custom) ----------------
const localPreview = new Map(); // just-uploaded photos aren't on the website for about a minute
let phOpen = null, phGridTop = 0; // the photo open in its own view ({ i: room, j: photo }), and where the grid was scrolled
function thumb(ph, w = 640) {
  if (localPreview.has(ph.src)) return localPreview.get(ph.src);
  const m = ph.src.match(/^(assets\/img\/.+)\.jpe?g$/i);
  return m ? `../${m[1]}-${w}.${ph.webp === false ? "jpg" : "webp"}` : `../${ph.src}`;
}
const allPhotos = (p) => p.tour.flatMap((r) => r.photos);
function photosHTML(p) {
  if (phOpen && p.tour[phOpen.i]?.photos[phOpen.j]) return photoHTML(p, phOpen.i, phOpen.j);
  phOpen = null;
  const rooms = p.tour;
  return `<p class="muted small" style="margin-top:0">The first photo is the cover on the home page and listing. Tap a photo to add a caption, move it or make it the cover.</p>
    ${rooms.map((r, i) => `
    <section class="room">
      <div class="fld-row">
        <label class="fld"><span>Room</span><input data-path="tour.${i}.room" data-type="text" value="${esc(r.room)}"></label>
        <label class="fld"><span>Short note</span><input data-path="tour.${i}.note" data-type="text" value="${esc(r.note || "")}" placeholder="Queen bed · Aircon"></label>
      </div>
      <div class="ph-grid">${r.photos.map((ph, j) => `
        <button type="button" class="ph" data-ph-open data-r="${i}" data-j="${j}" aria-label="Edit photo ${j + 1} in ${esc(r.room)}">
          <span class="ph-img"><img src="${esc(thumb(ph))}" alt="" loading="lazy">${i === 0 && j === 0 ? `<span class="cover">Cover</span>` : ""}<span class="ph-more" aria-hidden="true">•••</span></span>
          <span class="ph-cap${ph.alt ? "" : " empty"}">${esc(ph.alt || "Add a caption")}</span>
        </button>`).join("")}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <label class="upload"><input type="file" accept="image/*" multiple data-upload="${i}"><span class="btn btn-soft btn-sm">${icons.grid} Add photos</span></label>
        ${r.photos.length ? "" : `<button type="button" class="mini danger" data-room-del="${i}">Remove empty room</button>`}
      </div>
    </section>`).join("")}
    <button type="button" class="add-btn" style="margin-top:20px" data-room-add>+ Add a room</button>`;
}
/** One photo on its own: big preview, caption, room, order, cover, delete. */
function photoHTML(p, i, j) {
  const r = p.tour[i], ph = r.photos[j], isCover = i === 0 && j === 0;
  const a = (act, label, extra = "") => `<button type="button" class="btn btn-soft btn-sm" data-ph="${act}" data-r="${i}" data-j="${j}" ${extra}>${label}</button>`;
  return `<button type="button" class="ph-back" data-ph-back>← All photos</button>
    <div class="ph-big"><img src="${esc(thumb(ph, 1280))}" alt="">${isCover ? `<span class="cover">Cover</span>` : ""}</div>
    <p class="muted small">Photo ${j + 1} of ${r.photos.length} in ${esc(r.room)}</p>
    <label class="fld"><span>Caption</span><textarea rows="2" data-path="tour.${i}.photos.${j}.alt" data-type="text" placeholder="Queen bed with striped pillows">${esc(ph.alt || "")}</textarea>
      <small class="muted">A few words on what's in the photo. Screen readers read it out, and it helps Google.</small></label>
    ${p.tour.length > 1 ? `<label class="fld"><span>Room</span><select data-ph-room data-r="${i}" data-j="${j}">${p.tour.map((x, k) => `<option value="${k}"${k === i ? " selected" : ""}>${esc(x.room)}</option>`).join("")}</select></label>` : ""}
    <div class="ph-acts">
      ${a("left", "Move earlier", j === 0 ? "disabled" : "")}
      ${a("right", "Move later", j === r.photos.length - 1 ? "disabled" : "")}
      ${isCover ? "" : a("cover", "Make cover photo")}
    </div>
    <button type="button" class="ph-del" data-ph="del" data-r="${i}" data-j="${j}">Delete photo</button>`;
}
function showPhoto(next) {
  if (!phOpen && next) phGridTop = $("#ed-body").scrollTop;
  const back = phOpen && !next;
  phOpen = next; drawEditor();
  $("#ed-body").scrollTop = back ? phGridTop : 0;
}
$("#ed-body").addEventListener("click", (e) => {
  if (!ed.section?.custom) return;
  const p = ed.draft;
  const o = e.target.closest("[data-ph-open]");
  if (o) return showPhoto({ i: Number(o.dataset.r), j: Number(o.dataset.j) });
  if (e.target.closest("[data-ph-back]")) return showPhoto(null);
  const b = e.target.closest("[data-ph]");
  if (b) {
    const i = Number(b.dataset.r), j = Number(b.dataset.j), list = p.tour[i].photos;
    const act = b.dataset.ph;
    if (act === "left" || act === "right") { const k = j + (act === "left" ? -1 : 1); [list[j], list[k]] = [list[k], list[j]]; phOpen = { i, j: k }; }
    if (act === "cover") { const [ph] = list.splice(j, 1); p.tour[0].photos.unshift(ph); phOpen = { i: 0, j: 0 }; }
    if (act === "del") {
      if (allPhotos(p).length === 1 && p.status !== "hidden") return toast("A live listing needs at least one photo.");
      if (!confirm("Delete this photo from the listing?")) return;
      list.splice(j, 1);
      syncCover(p); markDirty(); return showPhoto(null);
    }
    syncCover(p); markDirty(); drawEditor(); return;
  }
  if (e.target.closest("[data-room-add]")) { p.tour.push({ room: "New room", note: "", photos: [] }); markDirty(); drawEditor(); return; }
  const rd = e.target.closest("[data-room-del]");
  if (rd) { p.tour.splice(Number(rd.dataset.roomDel), 1); markDirty(); drawEditor(); }
});
$("#ed-body").addEventListener("change", async (e) => {
  if (!ed.section?.custom) return;
  const p = ed.draft;
  const mv = e.target.closest("[data-ph-room]");
  if (mv) {
    const from = Number(mv.dataset.r), to = Number(mv.value);
    if (from === to) return;
    const [ph] = p.tour[from].photos.splice(Number(mv.dataset.j), 1);
    p.tour[to].photos.push(ph);
    phOpen = { i: to, j: p.tour[to].photos.length - 1 };
    syncCover(p); markDirty(); drawEditor(); return;
  }
  const up = e.target.closest("[data-upload]");
  if (up && up.files.length) {
    const files = [...up.files], room = p.tour[Number(up.dataset.upload)];
    const save = $("#ed-save");
    save.disabled = true;
    for (const [n, file] of files.entries()) {
      $("#ed-status").textContent = `Uploading photo ${n + 1} of ${files.length}…`;
      try {
        const v = await variants(file);
        const r = await api("POST", "/api/photos", { name: file.name, ...v.data });
        localPreview.set(r.src, URL.createObjectURL(file));
        room.photos.push({ src: r.src, alt: "", ...(r.webp ? {} : { webp: false }) });
        syncCover(p); markDirty(); drawEditor();
      } catch (err) { toast(`${file.name}: ${err.message}`); }
    }
    save.disabled = false;
    $("#ed-status").textContent = "Photos uploaded. Press Save to put them on the listing.";
  }
});
function syncCover(p) {
  const first = allPhotos(p)[0];
  if (first) { p.cover = first.src; p.hero = first.src; }
}
/** Resize in the browser: big JPG + 1280/640 WebP (or JPG where the browser can't make WebP). */
async function variants(file) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("That file isn't a photo we can read."); });
  const draw = (w, type, q) => new Promise((res) => {
    const s = Math.min(1, w / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    c.toBlob(res, type, q);
  });
  const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  const jpg = await draw(2000, "image/jpeg", 0.85);
  let large = await draw(1280, "image/webp", 0.8), small = await draw(640, "image/webp", 0.8);
  if (large?.type !== "image/webp") { large = await draw(1280, "image/jpeg", 0.82); small = await draw(640, "image/jpeg", 0.8); }
  return { data: { jpg: await b64(jpg), large: await b64(large), small: await b64(small) } };
}

// ---------------- Listing ----------------
const ICONS = [["pool", "Pool"], ["key", "Key / self check-in"], ["pin", "Location pin"], ["spark", "Sparkle"], ["home", "Home"], ["wifi", "Wi-Fi"], ["car", "Car / parking"], ["leaf", "Garden"], ["bed", "Bed"], ["tv", "TV"], ["shield", "Security"], ["users", "Guests"]];
const photoOptions = (p) => allPhotos(p).map((ph) => [ph.src, ph.alt || ph.src.split("/").pop()]);
const LISTING = [
  { id: "photos", title: "Photos", custom: photosHTML, preview: (p) => `${plural(allPhotos(p).length, "photo")} in ${plural(p.tour.length, "room")}`, thumbs: true },
  { id: "basics", title: "Title & description", preview: (p) => p.title, fields: [
    F("title", "Listing title", "text", { hint: "Shown at the top of the listing. Keep it short: what it is and the best feature." }),
    { type: "row", fields: [F("name", "Short name"), F("kind", "Type of place", "text", { placeholder: "Entire condo" })] },
    F("summary", "One-line summary", "textarea", { rows: 2 }),
    F("description", "Description", "paras"),
    F("highlights", "Highlights (the 3–4 best things)", "list", { itemLabel: (h) => h.title || "New highlight", addLabel: "Add highlight", def: { icon: "spark", title: "", text: "" }, fields: [
      F("icon", "Icon", "select", { options: ICONS }), F("title", "Title"), F("text", "Detail")] }),
  ] },
  { id: "rooms", title: "Guests & rooms", preview: (p) => `${plural(p.guests, "guest")} · ${plural(p.bedrooms, "bedroom")} · ${plural(p.beds, "bed")} · ${plural(p.baths, "bath")}`, fields: [
    { type: "row", fields: [F("guests", "Max guests", "number", { step: 1 }), F("bedrooms", "Bedrooms", "number", { step: 1 }), F("beds", "Beds", "number", { step: 1 }), F("baths", "Bathrooms", "number", { step: 0.5 })] },
    F("sleeping", "Where guests sleep", "list", { itemLabel: (s) => s.room || "New room", addLabel: "Add a sleeping area", def: { room: "", beds: "", photo: "" }, fields: [
      { type: "row", fields: [F("room", "Room"), F("beds", "Beds", "text", { placeholder: "1 queen bed" })] }, F("photo", "Photo", "select", { options: (p) => [["", "No photo"], ...photoOptions(p)] })] }),
  ] },
  { id: "pricing", title: "Pricing", preview: (p) => Object.entries(p.stayTypes).map(([t, s]) => `${money(S.site, s.price)} ${t === "monthly" ? "month" : "night"}${s.confirmed ? "" : " (estimate)"}`).join(" · "), fields: [
    F("stayTypes.nightly", "Offer short stays (per night)", "present", { def: { price: 0, minNights: 1, confirmed: false }, fields: [
      { type: "row", fields: [F("price", "Nightly price (₱)", "number", { step: 1 }), F("minNights", "Minimum nights", "number", { step: 1, min: 1 })] },
      F("confirmed", "This is the real price", "check", { hint: "When ticked, guests see an exact total and the request message quotes it. When not, the site says \"About ₱…\" and asks you to confirm." })] }),
    F("stayTypes.monthly", "Offer monthly rentals", "present", { def: { price: 0, minNights: 30, note: "", confirmed: false }, fields: [
      { type: "row", fields: [F("price", "Monthly price (₱)", "number", { step: 1 }), F("minNights", "Minimum nights", "number", { step: 1, min: 1 })] },
      F("note", "Note", "text", { placeholder: "Utilities billed separately" }),
      F("confirmed", "This is the real price", "check")] }),
    F("addons.parking", "Offer parking as an add-on", "present", { def: { label: "Parking", price: 300, per: "night" }, fields: [F("price", "Parking per night (₱)", "number", { step: 1 })] }),
    F("promos.earlyBird", "Early-bird discount", "present", { def: { confirmed: true, percent: 10, daysAhead: 7, label: "Early-bird: 10% off when you book 7+ days before check-in" }, fields: [
      { type: "row", fields: [F("percent", "Discount %", "number", { step: 1 }), F("daysAhead", "Book at least … days ahead", "number", { step: 1 })] },
      F("label", "How it's described"),
      F("confirmed", "Show this discount on the website", "check")] }),
  ] },
  { id: "amenities", title: "Amenities", preview: (p) => (p.topAmenities || []).slice(0, 4).join(", "), fields: [
    F("topAmenities", "Top amenities (shown first, up to 10)", "lines", { rows: 8 }),
    F("amenities", "All amenities by group", "list", { itemLabel: (g) => g.group || "New group", addLabel: "Add a group", def: { group: "", items: [] }, fields: [
      F("group", "Group name"), F("items", "Items", "lines"), F("missing", "These are NOT included (shown crossed out)", "check")] }),
  ] },
  { id: "location", title: "Location", preview: (p) => `${p.building}, ${p.address || p.area}`, fields: [
    { type: "row", fields: [F("building", "Building"), F("area", "Area")] },
    F("address", "Street address"), F("city", "City, country"),
    F("neighborhood", "About the neighborhood", "textarea"),
    { type: "row", fields: [F("map.lat", "Latitude", "number"), F("map.lon", "Longitude", "number"), F("map.zoom", "Map zoom", "number", { step: 1 })] },
    F("map.google", "Google Maps link", "text", { input: "url", hint: "In Google Maps, open the building, press Share, copy the link. Right-click the pin to copy latitude and longitude." }),
  ] },
  { id: "rules", title: "House rules", preview: (p) => `Check-in ${p.rules?.checkIn} · Checkout ${p.rules?.checkOut}`, fields: [
    { type: "row", fields: [F("rules.checkIn", "Check-in"), F("rules.checkOut", "Checkout")] },
    F("rules.selfCheckIn", "Check-in method"),
    F("rules.maxGuests", "Max guests", "number", { step: 1 }),
    F("rules.cancellation", "Cancellation policy", "textarea"),
  ] },
  { id: "channels", title: "Booking links & calendar sync", preview: (p) => Object.entries(p.channels || {}).map(([k, c]) => `${names[k] || k}: ${c.ical ? "syncing" : c.url ? "link only" : "off"}`).join(" · "),
    intro: "Paste each platform's calendar export link so the website knows which nights are taken. It checks them every hour.", fields: [
    F("channels.airbnb.url", "Airbnb listing link", "text", { input: "url", placeholder: "https://www.airbnb.com/rooms/…" }),
    F("channels.airbnb.ical", "Airbnb calendar export link", "text", { input: "url", hint: "Airbnb → Calendar → Availability → Connect calendars → Export calendar." }),
    F("channels.booking.url", "Booking.com listing link", "text", { input: "url" }),
    F("channels.booking.ical", "Booking.com calendar export link", "text", { input: "url", hint: "Booking.com Extranet → Rates & availability → Sync calendars → Export." }),
    { type: "info", html: (p) => `<span>Your calendar link (paste into Airbnb and Booking.com “Import”)</span><div class="copy"><code>${esc(siteBase())}ical/${esc(p.id)}.ics</code><button type="button" class="mini" data-copy="${esc(siteBase())}ical/${esc(p.id)}.ics">Copy</button></div>` },
  ] },
  { id: "reviews", title: "Reviews", preview: (p) => (p.rating ? `${p.rating.value} from ${p.rating.count} reviews on ${p.rating.source}` : "No rating shown"),
    intro: "Copy these from your Airbnb listing so the numbers match. Only show reviews guests posted publicly.", fields: [
    F("rating", "Show a guest rating", "present", { def: { source: "Airbnb", value: 5, count: 0, categories: {}, reviews: [] }, fields: [
      { type: "row", fields: [F("value", "Rating (out of 5)", "number", { step: 0.01 }), F("count", "Number of reviews", "number", { step: 1 }), F("source", "From")] },
      { type: "row", fields: ["Cleanliness", "Accuracy", "Check-in", "Communication", "Location", "Value"].map((c) => F(`categories.${c}`, c, "number", { step: 0.1 })) },
      F("reviews", "Featured reviews", "list", { itemLabel: (r) => r.name || "New review", addLabel: "Add a review", def: { name: "", date: "", stars: 5, text: "" }, fields: [
        { type: "row", fields: [F("name", "Guest first name"), F("date", "Month & year", "text", { placeholder: "October 2026" }), F("stars", "Stars", "number", { step: 1 })] },
        F("text", "What they wrote", "textarea", { rows: 3 })] }),
    ] }),
  ] },
  { id: "visibility", title: "Visibility", preview: (p) => (p.status === "hidden" ? "Hidden from the website" : "Live on the website"),
    check: (p) => (p.status !== "hidden" && !allPhotos(p).length ? "Add at least one photo before setting it to Live." : p.status !== "hidden" && !Object.values(p.stayTypes).some((s) => s.price > 0) ? "Set a price before setting it to Live." : ""),
    fields: [
    F("status", "Show on the website", "select", { options: [["live", "Live: guests can find it"], ["hidden", "Hidden: only people with the link"]] }),
    { type: "info", html: (p) => `<span>Web address</span><div class="copy"><code>${esc(siteBase())}property.html?id=${esc(p.id)}</code><button type="button" class="mini" data-copy="${esc(siteBase())}property.html?id=${esc(p.id)}">Copy</button></div>` },
    { type: "info", html: () => (S.site.properties.length > 1 ? `<span>Remove this property</span><button type="button" class="btn btn-soft btn-sm" data-delete-prop style="justify-self:start;color:#b3363a">Delete property…</button><small>You can bring it back from Changes.</small>` : "") },
  ] },
];

function renderListing() {
  const p = prop();
  $("#view").innerHTML = `
    <h1>Listing</h1>
    <p class="ad-sub">Everything guests see about each place. Changes go live about a minute after you save.</p>
    ${propChips()}
    <div class="prop-head">
      <div><h2 style="margin:0">${esc(p.name)}</h2><span class="pill ${p.status === "hidden" ? "hidden" : "live"}">${p.status === "hidden" ? "Hidden" : "Live"}</span></div>
      <div class="row" style="gap:8px">${allPhotos(p).length ? `<a class="btn btn-soft btn-sm" href="../property.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View listing ↗</a>` : `<span class="muted small">Add a photo to preview it</span>`}<button class="btn btn-soft btn-sm" data-add-prop>+ Add a property</button></div>
    </div>
    <div class="sec-grid">${LISTING.map((s) => `<button type="button" class="sec-card" data-sec="${s.id}"><b>${esc(s.title)}</b><span class="prev">${esc(s.preview(p) || "")}</span>${icons.chevR}${s.thumbs ? `<span class="thumbs">${allPhotos(p).slice(0, 5).map((ph) => `<img src="${esc(thumb(ph))}" alt="" loading="lazy">`).join("")}</span>` : ""}</button>`).join("")}</div>`;
}
app.addEventListener("click", async (e) => {
  const sec = e.target.closest("[data-sec]");
  if (sec && S.tab === "listing") return openEditor(LISTING.find((s) => s.id === sec.dataset.sec), "prop");
  if (sec && S.tab === "website") return openEditor(WEBSITE.find((s) => s.id === sec.dataset.sec), "site");
  if (e.target.closest("[data-add-prop]")) return addProperty();
});
$("#ed-body").addEventListener("click", async (e) => {
  if (!e.target.closest("[data-delete-prop]")) return;
  const p = prop();
  if (!confirm(`Delete ${p.name} from the website? You can bring it back from Changes.`)) return;
  const next = clone(S.site);
  next.properties = next.properties.filter((x) => x.id !== p.id);
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Delete property ${p.name}` });
    S.site = next; S.siteSha = r.siteSha; S.prop = next.properties[0].id;
    ed.dirty = false; ed.dlg.close(); toast(`${p.name} deleted.`); render();
  } catch (err) { toast(err.message); }
});
async function addProperty() {
  const name = prompt("Name of the new place (for example: CK Haven 2)");
  if (!name?.trim()) return;
  let id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unit";
  while (S.site.properties.some((p) => p.id === id)) id += "-2";
  // A new place starts as an empty hidden draft. Only things likely shared with the current place
  // carry over (its building, location and house rules); photos, text, prices and reviews start blank.
  const from = prop();
  const p = {
    id, name: name.trim(), title: name.trim(), status: "hidden",
    kind: from.kind, city: from.city, building: from.building, area: from.area, address: from.address,
    map: clone(from.map), neighborhood: from.neighborhood || "",
    summary: "", description: [], size: "",
    guests: 2, bedrooms: 1, beds: 1, baths: 1,
    stayTypes: Object.fromEntries(Object.entries(from.stayTypes).map(([t, s]) => [t, { price: 0, minNights: s.minNights, confirmed: false }])),
    addons: {}, cover: "", hero: "",
    tour: ["Bedroom", "Living room", "Kitchen", "Bathroom"].map((room) => ({ room, note: "", photos: [] })),
    hiddenPhotos: [], videos: [], rawVideos: [], sleeping: [], highlights: [],
    amenities: (from.amenities || []).filter((g) => g.group === "Building").map(clone), topAmenities: [],
    rules: clone(from.rules), faq: [],
    channels: { airbnb: { url: "", ical: "" }, booking: { url: "", ical: "" } },
  };
  const next = clone(S.site);
  next.properties.push(p);
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Add property ${p.name} (hidden)` });
    S.site = next; S.siteSha = r.siteSha; S.prop = id;
    toast(`${p.name} added as a hidden draft. Location, building amenities and house rules came from ${from.name}; add photos, details and prices, then set it to Live.`);
    render();
  } catch (err) { toast(err.message); }
}

// ---------------- Website (site-wide) ----------------
const WEBSITE = [
  { id: "brand", title: "Business name", preview: (s) => `${s.brand} · ${s.tagline || ""}`, fields: [F("brand", "Business name"), F("tagline", "Tagline")] },
  { id: "home", title: "Home page text", preview: (s) => s.home?.headline, fields: [
    F("home.headline", "Big headline"), F("home.intro", "Intro under the headline", "textarea", { rows: 3 }),
    F("home.locationTitle", "Location section title"), F("home.locationText", "Location section text", "textarea", { rows: 3 }),
    F("home.contactTitle", "Contact section title"), F("home.contactText", "Contact section text", "textarea", { rows: 2 }),
  ] },
  { id: "contact", title: "Contact & social", preview: (s) => [s.contact?.phone, s.contact?.email].filter(Boolean).join(" · "),
    intro: "Leave a field empty to hide that button on the website.", fields: [
    { type: "row", fields: [F("contact.phone", "Phone (for calls and texts)", "text", { input: "tel" }), F("contact.email", "Email", "text", { input: "email" })] },
    { type: "row", fields: [F("contact.whatsapp", "WhatsApp number", "text", { input: "tel", placeholder: "+639…" }), F("contact.viber", "Viber number", "text", { input: "tel", placeholder: "+639…" })] },
    F("contact.messenger", "Facebook page username (for Messenger)", "text", { hint: "The part after facebook.com/, e.g. CKHaven1133" }),
    F("contact.facebook", "Facebook page link", "text", { input: "url" }),
    F("contact.instagram", "Instagram link", "text", { input: "url" }),
    F("contact.responseTime", "Response time", "text", { placeholder: "Responds within an hour" }),
  ] },
  { id: "host", title: "Host profile", preview: (s) => `${s.host?.name} · ${s.host?.yearsHosting} years hosting`, fields: [
    { type: "row", fields: [F("host.name", "Name"), F("host.initial", "Initial (avatar)")] },
    F("host.bio", "About you", "textarea", { rows: 4 }),
    { type: "row", fields: [F("host.yearsHosting", "Years hosting", "number", { step: 1 }), F("host.responseRate", "Response rate", "text", { placeholder: "100%" })] },
    F("host.languages", "Languages", "lines", { rows: 3 }), F("host.cohosts", "Co-hosts", "lines", { rows: 3 }),
  ] },
  { id: "advanced", title: "Advanced", preview: (s) => (s.demo ? "Demo mode is on" : "Live mode"), fields: [
    F("demo", "Demo mode", "check", { hint: "Shows a “Demo preview” banner and sample bookings. Turn off for real guests." }),
    F("siteUrl", "Website address", "text", { input: "url", hint: "e.g. https://ckhaven.github.io/ckhavensuite/ (used for calendar links and share previews)" }),
    F("adminApi", "Admin service address", "text", { input: "url" }),
    F("analytics.goatcounter", "GoatCounter code (free visitor stats)", "text"),
  ] },
];
function renderWebsite() {
  $("#view").innerHTML = `
    <h1>Website</h1>
    <p class="ad-sub">Details shared by every page: your name, contact buttons, host profile and home page text.</p>
    <div class="sec-grid">${WEBSITE.map((s) => `<button type="button" class="sec-card" data-sec="${s.id}"><b>${esc(s.title)}</b><span class="prev">${esc(s.preview(S.site) || "")}</span>${icons.chevR}</button>`).join("")}</div>`;
}

// ---------------- Changes ----------------
async function renderChanges() {
  $("#view").innerHTML = `<h1>Changes</h1><p class="ad-sub">Every save is kept. Go back to any earlier version if something looks wrong.</p><section class="panel"><p class="muted">Loading…</p></section>`;
  try {
    const { changes } = await api("GET", "/api/history");
    $("#view .panel").innerHTML = changes.length ? `<ul class="changes">${changes.map((c, i) => `<li><div><b>${esc(c.message.replace(/ \(by [^)]*\)$/, ""))}</b><div class="when">${esc(c.author)} · ${timeAgo(c.date)} · ${new Date(c.date).toLocaleString()}</div></div>${i === 0 ? `<span class="pill live">Current</span>` : `<button class="btn btn-soft btn-sm" data-restore="${esc(c.sha)}" data-label="${esc(c.message.replace(/ \(by [^)]*\)$/, ""))}">Go back to this</button>`}</li>`).join("")}</ul>` : `<p class="muted">No changes yet.</p>`;
  } catch (err) { $("#view .panel").innerHTML = `<p>${esc(err.message)}</p>`; }
}
app.addEventListener("click", async (e) => {
  const r = e.target.closest("[data-restore]");
  if (!r) return;
  if (!confirm("Go back to this version of the website details? Your current version stays in the list, so you can undo this too.")) return;
  r.disabled = true; r.textContent = "Restoring…";
  try { await api("POST", "/api/restore", { sha: r.dataset.restore, label: r.dataset.label }); await refresh(); toast("Restored. Live on the website in about a minute."); renderChanges(); }
  catch (err) { toast(err.message); r.disabled = false; r.textContent = "Go back to this"; }
});

await boot();
