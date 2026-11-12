// CK Haven admin for a small property management company: Overview, Units, Properties (buildings),
// Inbox, Calendar (only when a unit takes nightly guests), Website and Changes. Saves go to the
// admin API, which commits to GitHub.
import { $, $$, esc, money, plural, monthHTML, todayISO, pretty, nightsBetween, addDays, icons, toast as baseToast, timeAgo, MINDANAO, PROVINCES, CATEGORIES, MODES, categoryLabel, placeOf } from "../js/common.js";

// ---------------- setup ----------------
const TOKEN_KEY = "ckhaven-admin-token";
const S = { token: load(TOKEN_KEY), user: null, site: null, siteSha: null, bookings: [], avail: { properties: {} }, tab: "overview", prop: null, bldg: 0, cal: {} };
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const app = $("#app");
const names = { airbnb: "Airbnb", booking: "Booking.com", direct: "Direct" };
const today = todayISO();
const siteBase = () => (S.site?.siteUrl ? S.site.siteUrl.replace(/\/?$/, "/") : new URL("../", location.href).href);
const prop = () => S.site.properties.find((p) => p.id === S.prop) || S.site.properties[0];
const isOwner = () => S.user?.role === "owner";
const clone = (o) => structuredClone(o);
// Each unit is available now, coming soon (a tenant is moving out) or rented.
const AV = { available: "Available", soon: "Coming soon", rented: "Rented" };
const avOf = (p) => (AV[p.availability] ? p.availability : "available");
const avText = (p) => `${AV[avOf(p)]}${avOf(p) === "soon" && p.availableFrom ? ` from ${pretty(p.availableFrom)}` : ""}`;
const hasNightly = () => S.site.properties.some((p) => p.stayTypes?.nightly);
const bldgs = () => (S.site.buildings ||= []);
const bldg = () => bldgs()[S.bldg] || bldgs()[0];
const unitsIn = (name, site = S.site) => site.properties.filter((p) => (p.building || "") === name);
const WORDMARK = `<span class="ad-word">CK Haven<small>Admin</small></span>`;

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
  // Owners now write in through the contact form, so the demo has no old-style owner leads.
  st.submissions ||= [];
  if (key === "GET /api/submissions") return { submissions: clone(st.submissions) };
  if (key === "POST /api/submissions/status") { const s = st.submissions.find((x) => x.id === b.id); if (!s) throw new Error("That request can't be found."); Object.assign(s, { status: b.status, decidedBy: D.user.name, ...(b.propertyId ? { propertyId: b.propertyId } : {}) }); keep(); return { ok: true, submission: clone(s) }; }
  if (key === "DELETE /api/submissions") { st.submissions = st.submissions.filter((x) => x.id !== b.id); keep(); return { ok: true }; }
  // Two clearly made-up contact-form messages so the Inbox can be tried in the demo.
  st.enquiries ||= [
    { id: "demo-e1", date: new Date(Date.now() - 40 * 60e3).toISOString(), status: "new", name: "Sample Visitor (demo)", phone: "+63 900 000 0001", who: "viewing", unit: st.site.properties[0]?.id || "", msg: "This is a made-up message to show how viewing requests arrive. Could I see the unit this Saturday morning?" },
    { id: "demo-e2", date: new Date(Date.now() - 26 * 3600e3).toISOString(), status: "new", name: "Sample Resident (demo)", phone: "", who: "resident", unit: "", msg: "Made-up example: the bathroom tap is dripping. Could someone take a look this week?" },
  ];
  if (key === "GET /api/enquiries") return { enquiries: clone(st.enquiries) };
  if (key === "POST /api/enquiries/status") { const x = st.enquiries.find((q) => q.id === b.id); if (!x) throw new Error("That message can't be found."); Object.assign(x, { status: b.status, handledBy: b.status === "done" ? D.user.name : "" }); keep(); return { ok: true, enquiry: clone(x) }; }
  if (key === "DELETE /api/enquiries") { st.enquiries = st.enquiries.filter((q) => q.id !== b.id); keep(); return { ok: true }; }
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
        <a class="logo" href="../index.html">${WORDMARK}</a>
        <h1>Log in</h1>
        <p class="muted small" style="margin:0 0 20px">Units, buildings, messages and the website, in one place.</p>
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
  Object.assign(S, { token: null, user: null, tab: "overview", cal: {} });
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
    if (!tabs().some(([k]) => k === S.tab)) S.tab = "overview";
    shell();
  } catch (err) {
    if (S.token) showLogin(err.message);
  }
}
function setData(d) { S.site = d.site; S.siteSha = d.siteSha; S.bookings = d.bookings; S.avail = d.availability; }
async function refresh() { setData(await api("GET", "/api/data")); }

// ---------------- shell ----------------
// [key, label, icon, owner only, shown when]. The short-stay calendar isn't a tab: it opens from
// a unit's Short stays section and the Overview, and only matters for direct nightly bookings.
const TABS = [
  ["overview", "Overview", icons.home],
  ["units", "Units", icons.grid, true],
  ["properties", "Properties", icons.pin, true],
  ["inbox", "Inbox", icons.chat],
  ["website", "Website", icons.spark, true],
  ["changes", "Changes", icons.clock, true],
];
const tabs = () => TABS.filter(([, , , own, when]) => (!own || isOwner()) && (!when || when()));
function tabsHTML(cls) {
  return `<nav class="ad-tabs ${cls}" aria-label="Sections">${tabs().map(([k, l, ic]) => `<button type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${ic}<span>${l}</span></button>`).join("")}</nav>`;
}
function shell() {
  const u = S.user;
  app.innerHTML = `${DEMO ? `<div class="demo-bar" role="status"><b>Demo</b> Try anything: changes stay in this browser tab and never reach the real website. <button class="u" data-logout>Leave the demo</button></div>` : ""}
    <header class="ad-top"><div class="bar">
      <a class="logo" href="../index.html" target="_blank" rel="noopener" title="Open the website">${WORDMARK}</a>
      ${tabsHTML("")}
      <div class="ad-user"><span class="who"><b>${esc(u.name)}</b> <span class="muted">· ${u.role === "owner" ? "Owner" : "Co-host"}</span></span><div class="avatar" title="${esc(u.name)} · ${u.role === "owner" ? "Owner" : "Co-host"}">${esc(u.name[0])}</div><button class="u small" data-logout>Log out</button></div>
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
  if (p) {
    S.prop = p.dataset.prop; S.cal = {};
    if (p.dataset.go) { S.tab = p.dataset.go; shell(); scrollTo(0, 0); } else render();
    const sec = p.dataset.openSec && LISTING.find((s) => s.id === p.dataset.openSec);
    if (sec) openEditor(sec, "prop");
    return;
  }
  const bl = e.target.closest("[data-bldg]");
  if (bl) { S.bldg = Number(bl.dataset.bldg); if (bl.dataset.go) { S.tab = bl.dataset.go; shell(); scrollTo(0, 0); } else render(); }
});
function render() {
  $("#bar").hidden = true;
  ({ overview: renderOverview, units: renderUnits, properties: renderProperties, inbox: renderInbox, calendar: renderCalendar, website: renderWebsite, changes: renderChanges })[S.tab]();
}
const propChips = (list = S.site.properties) => list.length > 1
  ? `<div class="chips" role="group" aria-label="Unit">${list.map((p) => `<button type="button" data-prop="${esc(p.id)}" aria-pressed="${p.id === prop().id}">${esc(p.name)}</button>`).join("")}</div>` : "";

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

// ---------------- Overview ----------------
// The day's picture for a property manager: what's free, what's rented, who wrote in, what's
// left to finish. Short-stay check-ins only show up when a unit actually takes nightly guests.
const rentOf = (p) => { const m = p.stayTypes?.monthly, n = p.stayTypes?.nightly; return m?.price ? `${money(S.site, m.price)}/mo` : n?.price ? `${money(S.site, n.price)}/night` : "No price"; };
function todoList() {
  const out = [];
  for (const p of S.site.properties) {
    const go = (sec, text) => out.push(`<li>${esc(text)} <button class="u" data-prop="${esc(p.id)}" data-go="units" data-open-sec="${sec}">Fix it</button></li>`);
    if (!allPhotos(p).length) go("photos", `${p.name}: add photos`);
    if (p.status === "hidden") go("status", `${p.name} is hidden from the website`);
    else for (const [t, st] of Object.entries(p.stayTypes || {})) if (!st.confirmed) go("pricing", `${p.name}: confirm the ${t === "monthly" ? "monthly rent" : "nightly rate"}`);
    if (avOf(p) === "soon" && !p.availableFrom) go("status", `${p.name}: add the date it's free from`);
    if (p.building && !bldgs().some((b) => b.name === p.building)) go("location", `${p.name}: its building "${p.building}" isn't in Properties yet`);
  }
  bldgs().forEach((b, i) => {
    const miss = [!b.photo && "a photo", !b.description?.length && "a description", !b.amenities?.length && "amenities"].filter(Boolean);
    if (miss.length) out.push(`<li>${esc(b.name)}: add ${miss.join(", ").replace(/, ([^,]*)$/, " and $1")} <button class="u" data-bldg="${i}" data-go="properties">Fix it</button></li>`);
  });
  return out;
}
function renderOverview() {
  const hr = new Date().getHours();
  const ps = S.site.properties.filter((p) => p.status !== "hidden");
  const count = (k) => ps.filter((p) => avOf(p) === k).length;
  const todo = isOwner() ? todoList() : [];
  $("#view").innerHTML = `
    <h1>Good ${hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"}, ${esc(S.user.name.split(" ")[0])}</h1>
    <p class="ad-sub">${plural(ps.length, "unit")} on the website across ${((n) => `${n} ${n === 1 ? "property" : "properties"}`)(new Set(ps.map((p) => p.building || p.name)).size)}.</p>
    <div class="today-cards">
      <div><small>Available</small><b>${count("available")}</b></div>
      <div><small>Coming soon</small><b>${count("soon")}</b></div>
      <div><small>Rented</small><b>${count("rented")}</b></div>
      <button type="button" data-tab="inbox"><small>New messages</small><b id="ov-new">…</b></button>
    </div>
    ${todo.length ? `<section class="panel"><h2 class="ad-h2">To finish</h2><ul class="todo">${todo.join("")}</ul></section>` : ""}
    <section class="panel">
      <h2 class="ad-h2">Units</h2>
      <table class="list"><tr><th>Unit</th><th>Property</th><th>Status</th><th>Rent</th>${isOwner() ? "<th></th>" : ""}</tr>
        ${S.site.properties.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.status === "hidden" ? ` <span class="pill hidden">Hidden</span>` : ""}</td><td>${esc(p.building || "—")}</td><td><span class="av av-${avOf(p)}">${esc(avText(p))}</span></td><td>${esc(rentOf(p))}</td>${isOwner() ? `<td><button class="mini" data-prop="${esc(p.id)}" data-go="units">Edit</button></td>` : ""}</tr>`).join("")}
      </table>
    </section>
    ${hasNightly() ? shortStaysHTML() : ""}`;
  // Unread count fills in once the inbox answers; a missing inbox just shows a dash.
  Promise.all([api("GET", "/api/enquiries").catch(() => null), isOwner() ? api("GET", "/api/submissions").catch(() => null) : null]).then(([e, s]) => {
    const el = $("#ov-new");
    if (!el) return;
    if (!e && !s) { el.textContent = "—"; return; }
    el.textContent = [...(e?.enquiries || []), ...(s?.submissions || [])].filter((x) => x.status === "new").length;
  });
}
function shortStaysHTML() {
  const all = S.site.properties.flatMap((p) => events(p.id).map((b) => ({ ...b, unit: p.name })));
  const ins = all.filter((b) => b.start === today), outs = all.filter((b) => b.end === today);
  const upcoming = all.filter((b) => b.end > today).slice(0, 6);
  const wd = { weekday: "short", month: "short", day: "numeric" };
  const sync = S.site.properties.flatMap((p) => Object.entries(S.avail.properties?.[p.id]?.channels || {}).map(([k, v]) => `<tr><td>${esc(p.name)} · ${names[k] || esc(k)}</td><td class="status-${esc(v)}">${{ ok: "Synced", error: "Couldn't read the calendar link. Check it.", "not-configured": "No calendar link yet", demo: "Sample data (demo mode)" }[v] || esc(v)}</td></tr>`));
  return `<section class="panel">
      <h2 class="ad-h2">Short stays</h2>
      <p class="muted small" style="margin:-4px 0 12px">Checking in today: ${ins.length ? esc(ins.map((b) => `${b.unit} (${names[b.source]})`).join(", ")) : "no one"}. Checking out: ${outs.length ? esc(outs.map((b) => b.unit).join(", ")) : "no one"}.</p>
      <table class="list"><tr><th>Unit</th><th>From</th><th>In</th><th>Out</th><th>Nights</th></tr>
        ${upcoming.map((b) => `<tr><td>${esc(b.unit)}</td><td><span class="dot" style="background:var(--${b.source})"></span> ${names[b.source]}</td><td>${pretty(b.start, wd)}</td><td>${pretty(b.end, wd)}</td><td>${nightsBetween(b.start, b.end)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No upcoming short stays.</td></tr>`}
      </table>
      ${sync.length ? `<details class="ad-more"><summary>Airbnb and Booking.com calendar sync</summary><table class="list">${sync.join("")}</table></details>` : ""}
      <p style="margin:16px 0 0"><button class="btn btn-soft btn-sm" data-tab="calendar">Block dates</button></p>
    </section>`;
}

// ---------------- Calendar ----------------
function renderCalendar() {
  const nightly = S.site.properties.filter((p) => p.stayTypes?.nightly);
  if (!nightly.some((p) => p.id === S.prop) && nightly.length) S.prop = nightly[0].id;
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
    <button type="button" class="ad-back" data-tab="${isOwner() ? "units" : "overview"}">← ${isOwner() ? "Units" : "Overview"}</button>
    <h1>Block dates</h1>
    <p class="ad-sub">For short stays booked with you directly. Tap the first night and the checkout day; Airbnb and Booking.com stop selling those nights at their next calendar check. Their own bookings show here by themselves.</p>
    ${propChips(nightly)}
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
  ed.draft = clone(scope === "site" ? S.site : scope === "building" ? bldg() : prop());
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
  else if (ed.scope === "building") {
    next = clone(S.site);
    const old = next.buildings[S.bldg].name;
    ed.draft.name = String(ed.draft.name || "").trim();
    next.buildings[S.bldg] = ed.draft;
    // Units point at their building by name, so a rename carries over to them.
    if (old !== ed.draft.name) for (const p of next.properties) if (p.building === old) p.building = ed.draft.name;
  } else { next = clone(S.site); next.properties[next.properties.findIndex((p) => p.id === S.prop)] = ed.draft; }
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Update ${ed.section.title.toLowerCase()}${ed.scope === "site" ? "" : ` · ${ed.draft.name}`}` });
    S.site = next; S.siteSha = r.siteSha;
    if (ed.draft.id && ed.scope === "prop") S.prop = ed.draft.id;
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
const RESIDENTIAL = new Set(["condo", "house", "townhouse", "apartment", "room"]);
const ICONS = [["pool", "Pool"], ["key", "Key / self check-in"], ["pin", "Location pin"], ["spark", "Sparkle"], ["home", "Home"], ["wifi", "Wi-Fi"], ["car", "Car / parking"], ["leaf", "Garden"], ["bed", "Bed"], ["tv", "TV"], ["shield", "Security"], ["users", "Guests"]];
const photoOptions = (p) => allPhotos(p).map((ph) => [ph.src, ph.alt || ph.src.split("/").pop()]);
const LISTING = [
  { id: "status", title: "Status & availability", preview: (p) => `${p.status === "hidden" ? "Hidden" : "On the website"} · ${avText(p)}`,
    intro: "Rented units drop off the Availability page but keep their own page, marked as rented. Coming soon shows the date a new tenant can move in.",
    check: (p) => (p.status !== "hidden" && !allPhotos(p).length ? "Add at least one photo before putting it on the website."
      : p.status !== "hidden" && !Object.values(p.stayTypes || {}).some((st) => st.price > 0) && !p.sale ? "Set a price before putting it on the website."
      : p.status !== "hidden" && !p.locality ? "Add the city or town under Location before putting it on the website." : ""),
    fields: [
    { type: "row", fields: [
      F("availability", "Availability", "select", { options: [["available", "Available now"], ["soon", "Coming soon"], ["rented", "Rented"]] }),
      F("availableFrom", "Free from", "text", { input: "date", hint: "For coming soon: the first day someone can move in." })] },
    F("status", "On the website", "select", { options: [["live", "Shown: anyone can find it"], ["hidden", "Hidden: a draft, only people with the link"]] }),
    { type: "info", html: (p) => `<span>Web address</span><div class="copy"><code>${esc(siteBase())}property.html?id=${esc(p.id)}</code><button type="button" class="mini" data-copy="${esc(siteBase())}property.html?id=${esc(p.id)}">Copy</button></div>` },
    { type: "info", html: () => (S.site.properties.length > 1 ? `<span>Remove this unit</span><button type="button" class="btn btn-soft btn-sm" data-delete-prop style="justify-self:start;color:#b3363a">Delete unit…</button><small>You can bring it back from Changes.</small>` : "") },
  ] },
  { id: "photos", title: "Photos", custom: photosHTML, preview: (p) => `${plural(allPhotos(p).length, "photo")} in ${plural(p.tour.length, "room")}`, thumbs: true },
  { id: "basics", title: "Title & description", preview: (p) => p.title, fields: [
    F("title", "Headline", "text", { hint: "Shown at the top of the unit's page. Keep it short: what it is and the best feature." }),
    { type: "row", fields: [F("name", "Short name"), F("category", "Property type", "select", { options: (p) => [["", "Choose"], ...CATEGORIES.filter(([k]) => RESIDENTIAL.has(k) || k === p.category)] }), F("kind", "Type shown on the website", "text", { placeholder: "Entire condo" })] },
    F("summary", "One-line summary", "textarea", { rows: 2 }),
    F("description", "Description", "paras"),
    F("highlights", "Highlights (the 3–4 best things)", "list", { itemLabel: (h) => h.title || "New highlight", addLabel: "Add highlight", def: { icon: "spark", title: "", text: "" }, fields: [
      F("icon", "Icon", "select", { options: ICONS }), F("title", "Title"), F("text", "Detail")] }),
  ] },
  { id: "rooms", title: "Rooms & size", preview: (p) => [plural(p.bedrooms, "bedroom"), plural(p.baths, "bath"), p.size].filter(Boolean).join(" · "), fields: [
    { type: "row", fields: [F("bedrooms", "Bedrooms", "number", { step: 1 }), F("baths", "Bathrooms", "number", { step: 0.5 }), F("beds", "Beds", "number", { step: 1 }), F("size", "Floor area", "text", { placeholder: "28 m²" })] },
    F("pets", "Pets", "select", { options: [["", "Go by the building rules"], ["yes", "Pets allowed"], ["no", "No pets"], ["ask", "Ask us"]] }),
  ] },
  { id: "rules", title: "Short stays", when: (p) => p.stayTypes?.nightly, preview: (p) => [p.guests && `Up to ${plural(p.guests, "guest")}`, p.rules?.checkIn && `check-in ${p.rules.checkIn}`].filter(Boolean).join(" · ") || "Not set yet",
    intro: "Only for nightly guests. Monthly tenants don't see these.", fields: [
    { type: "row", fields: [F("guests", "Max guests", "number", { step: 1 }), F("rules.checkIn", "Check-in"), F("rules.checkOut", "Checkout")] },
    F("rules.selfCheckIn", "Check-in method"),
    F("rules.cancellation", "Cancellation policy", "textarea"),
    { type: "info", html: () => `<span>Direct bookings</span><button type="button" class="btn btn-soft btn-sm" data-open-cal style="justify-self:start">Block dates for a direct booking</button><small>So Airbnb and Booking.com don't sell the same nights.</small>` },
    F("sleeping", "Where guests sleep", "list", { itemLabel: (s) => s.room || "New room", addLabel: "Add a sleeping area", def: { room: "", beds: "", photo: "" }, fields: [
      { type: "row", fields: [F("room", "Room"), F("beds", "Beds", "text", { placeholder: "1 queen bed" })] }, F("photo", "Photo", "select", { options: (p) => [["", "No photo"], ...photoOptions(p)] })] }),
  ] },
  { id: "pricing", title: "Rent & rates", preview: (p) => [...Object.entries(p.stayTypes || {}).sort(([a]) => (a === "monthly" ? -1 : 1)).map(([t, s]) => `${money(S.site, s.price)} ${t === "monthly" ? "month" : "night"}${s.confirmed ? "" : " (estimate)"}`)].filter(Boolean).join(" · ") || "No rent set",
    intro: "Monthly rent comes first on the website. Add a nightly rate only if this unit also takes short-stay guests.", fields: [
    F("stayTypes.monthly", "Monthly rent", "present", { def: { price: 0, minNights: 30, note: "", confirmed: false }, fields: [
      { type: "row", fields: [F("price", "Monthly price (₱)", "number", { step: 1 }), F("minNights", "Minimum stay (nights)", "number", { step: 1, min: 1 })] },
      F("note", "Note", "text", { placeholder: "Utilities billed separately" }),
      F("confirmed", "This is the real price", "check")] }),
    F("stayTypes.nightly", "Short stays (per night)", "present", { def: { price: 0, minNights: 1, confirmed: false }, fields: [
      { type: "row", fields: [F("price", "Nightly price (₱)", "number", { step: 1 }), F("minNights", "Minimum nights", "number", { step: 1, min: 1 })] },
      F("confirmed", "This is the real price", "check", { hint: "When not ticked, the website says \"About ₱…\"." })] }),
  ] },
  { id: "amenities", title: "Amenities", preview: (p) => (p.topAmenities || []).slice(0, 4).join(", "), fields: [
    F("topAmenities", "Top amenities (shown first, up to 10)", "lines", { rows: 8 }),
    F("amenities", "All amenities by group", "list", { itemLabel: (g) => g.group || "New group", addLabel: "Add a group", def: { group: "", items: [] }, fields: [
      F("group", "Group name"), F("items", "Items", "lines"), F("missing", "These are NOT included (shown crossed out)", "check")] }),
  ] },
  { id: "location", title: "Location", intro: "The building's photo, amenities, neighbourhood and map are edited once, in Properties. A house can be its own property there too.", preview: (p) => [p.building, placeOf(p).city, p.province].filter(Boolean).join(", "), fields: [
    { type: "row", fields: [F("province", "Province", "select", { options: [["", "Choose a province"], ...PROVINCES.map((x) => [x, x])] }), F("locality", "City or town", "text", { hint: "Shown on the home page and used for search, e.g. Cagayan de Oro, Davao City." })] },
    { type: "row", fields: [F("building", "Property (building)", "select", { options: (p) => [["", "Not in a building (a house or lot)"], ...bldgs().map((b) => [b.name, b.name]), ...(p.building && !bldgs().some((b) => b.name === p.building) ? [[p.building, `${p.building} (not in Properties yet)`]] : [])], hint: "Add new buildings in the Properties tab." }), F("area", "Barangay or area")] },
    F("address", "Street address"), F("city", "City, country (for the address)"),
  ] },
  { id: "owner", title: "Unit owner (private)", preview: (p) => (p.owner?.name ? `${p.owner.name} · ${p.owner.role || "Owner"}` : "Not recorded"),
    intro: "Who owns this unit, for your own records. It isn't shown on the website: every enquiry comes to you.", fields: [
    F("owner", "Record the unit owner", "present", { def: { name: "", role: "Owner", phone: "", whatsapp: "", viber: "", messenger: "", email: "", responseTime: "", bio: "" }, fields: [
      { type: "row", fields: [F("name", "Name"), F("role", "Role", "select", { options: ["Owner", "Agent", "Broker", "Property manager", "Host"].map((x) => [x, x]) })] },
      { type: "row", fields: [F("phone", "Mobile (calls and texts)", "text", { input: "tel" }), F("email", "Email", "text", { input: "email" })] },
      { type: "row", fields: [F("whatsapp", "WhatsApp number", "text", { input: "tel" }), F("viber", "Viber number", "text", { input: "tel" })] },
      F("messenger", "Facebook page username (for Messenger)", "text", { hint: "The part after facebook.com/" }),
      F("responseTime", "Response time", "text", { placeholder: "Usually replies within a day" }),
      F("bio", "Notes", "textarea", { rows: 3, hint: "Contract dates, fee, anything to remember." })] }),
  ] },
  { id: "channels", title: "Airbnb & Booking.com", when: (p) => p.stayTypes?.nightly, preview: (p) => Object.entries(p.channels || {}).map(([k, c]) => `${names[k] || k}: ${c.ical ? "syncing" : c.url ? "link only" : "off"}`).join(" · "),
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
];

function renderUnits() {
  const p = prop();
  const secs = LISTING.filter((x) => !x.when || x.when(p));
  $("#view").innerHTML = `
    <div class="ad-head"><div><h1>Units</h1><p class="ad-sub">Each home you rent out: its status, photos, rent and details. Changes go live about a minute after you save.</p></div>
      <button class="btn btn-dark btn-sm" data-add-prop>+ Add a unit</button></div>
    ${S.site.properties.length > 1 ? `<div class="unit-pick" role="group" aria-label="Unit">${S.site.properties.map((x) => `<button type="button" data-prop="${esc(x.id)}" aria-pressed="${x.id === p.id}"><b>${esc(x.name)}</b><span class="av av-${avOf(x)}">${esc(x.status === "hidden" ? "Hidden draft" : AV[avOf(x)])}</span></button>`).join("")}</div>` : ""}
    <div class="prop-head">
      <div><h2 style="margin:0">${esc(p.name)}</h2><span class="av av-${avOf(p)}">${esc(avText(p))}</span>${p.status === "hidden" ? `<span class="pill hidden">Hidden</span>` : ""}</div>
      <div class="row" style="gap:8px">${allPhotos(p).length ? `<a class="btn btn-soft btn-sm" href="../property.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View on the website ↗</a>` : `<span class="muted small">Add a photo to preview it</span>`}</div>
    </div>
    <div class="sec-grid">${secs.map((x) => `<button type="button" class="sec-card" data-sec="${x.id}"><b>${esc(x.title)}</b><span class="prev">${esc(x.preview(p) || "")}</span>${icons.chevR}${x.thumbs ? `<span class="thumbs">${allPhotos(p).slice(0, 5).map((ph) => `<img src="${esc(thumb(ph))}" alt="" loading="lazy">`).join("")}</span>` : ""}</button>`).join("")}</div>`;
}

// ---------------- Properties (buildings) ----------------
// A building is written once and shared by every unit in it: its photo, amenities, neighbourhood
// and map. Units point at it by name (Units → Location).
// Every photo on the units (including ones hidden from a unit's page), building's own unit first.
const unitPhotos = (name) => {
  const all = (p) => [...allPhotos(p), ...(p.hiddenPhotos || [])];
  const own = unitsIn(name).flatMap(all), rest = S.site.properties.flatMap(all);
  return [...new Map([...own, ...rest].map((ph) => [ph.src, ph])).values()];
};
const BUILDING = [
  { id: "about", title: "Name & description", preview: (b) => b.description?.[0] || "No description yet", fields: [
    F("name", "Name", "text", { hint: "Renaming it also updates every unit in it." }),
    F("description", "About the building", "paras", { rows: 6, hint: "A few lines: what it is, who it suits. Leave a blank line between paragraphs." }),
  ], check: (b) => (!String(b.name || "").trim() ? "The name can't be empty."
    : bldgs().some((x, i) => i !== S.bldg && x.name.toLowerCase() === b.name.trim().toLowerCase()) ? `There's already a property called ${b.name.trim()}.` : "") },
  { id: "photo", title: "Photos", thumb: true, preview: (b) => `${b.photo ? "Main photo set" : "No main photo: the website uses a unit photo"}${b.photos?.length ? ` · ${plural(b.photos.length, "extra photo")}` : ""}`,
    intro: "Choose from the photos already on your units; to use a new one, add it to a unit first.", custom: (b) => `
    <h3 class="ad-h3">Main photo</h3><p class="muted small">On the property tiles and first on its page.</p>
    <div class="bl-photos">${[["", "Use a unit photo"], ...unitPhotos(b.name).map((ph) => [ph.src, ph.alt || ""])].map(([src, alt]) => `
      <label class="bl-ph"><input type="radio" name="bl-photo" data-path="photo" data-type="text" value="${esc(src)}" ${String(b.photo || "") === src ? "checked" : ""}>
        ${src ? `<img src="${esc(thumb({ src }))}" alt="${esc(alt)}" loading="lazy">` : `<span class="bl-none">Automatic</span>`}</label>`).join("")}</div>
    <h3 class="ad-h3">More photos</h3><p class="muted small">Shown on the building's page after the pool, gym and other shared spaces. Tick as many as you like.</p>
    <div class="bl-photos">${unitPhotos(b.name).map((ph) => `
      <label class="bl-ph"><input type="checkbox" data-bl-extra value="${esc(ph.src)}" ${(b.photos || []).some((x) => x.src === ph.src) ? "checked" : ""}>
        <img src="${esc(thumb(ph))}" alt="${esc(ph.alt || "")}" loading="lazy"></label>`).join("")}</div>` },
  { id: "place", title: "Location & neighbourhood", preview: (b) => [b.area, b.province].filter(Boolean).join(", "), fields: [
    { type: "row", fields: [F("area", "Barangay or area"), F("locality", "City or town")] },
    F("province", "Province", "select", { options: [["", "Choose a province"], ...PROVINCES.map((x) => [x, x])] }),
    F("neighborhood", "The neighbourhood", "textarea", { rows: 4, hint: "What's nearby: malls, offices, hospitals, the airport." }),
    F("map.google", "Google Maps link", "text", { input: "url", hint: "In Google Maps, open the building, press Share, copy the link." }),
    { type: "row", fields: [F("map.lat", "Latitude", "number"), F("map.lon", "Longitude", "number")] },
    { type: "info", html: () => "<small>For the map on the property's page. In Google Maps, right-click the building's pin to copy them.</small>" },
  ] },
  { id: "amenities", title: "Shared amenities", preview: (b) => (b.amenities || []).slice(0, 4).join(", ") || "None listed", fields: [
    F("amenities", "Amenities", "lines", { rows: 8, hint: "One per line. Pool, gym, security, parking. Fees and hours are fine to include." }),
  ] },
];
function renderProperties() {
  const list = bldgs();
  const loose = S.site.properties.filter((p) => !p.building);
  if (S.bldg >= list.length) S.bldg = 0;
  const b = bldg();
  $("#view").innerHTML = `
    <div class="ad-head"><div><h1>Properties</h1><p class="ad-sub">The buildings you manage units in. Write each one once; every unit in it shares the photo, amenities and neighbourhood.</p></div>
      <button class="btn btn-dark btn-sm" data-add-bldg>+ Add a property</button></div>
    ${list.length ? `<div class="bl-grid">${list.map((x, i) => {
      const us = unitsIn(x.name), free = us.filter((p) => p.status !== "hidden" && avOf(p) !== "rented").length;
      return `<button type="button" class="bl-card" data-bldg="${i}" aria-pressed="${i === S.bldg}">
        <span class="bl-img">${x.photo ? `<img src="${esc(thumb({ src: x.photo }))}" alt="" loading="lazy">` : ""}</span>
        <b>${esc(x.name)}</b><span class="muted small">${plural(us.length, "unit")}${us.length ? ` · ${free} open` : ""}</span></button>`; }).join("")}</div>` : `<section class="panel"><p class="muted" style="margin:0">No properties yet. Add the first building you manage units in.</p></section>`}
    ${b ? `<div class="prop-head"><div><h2 style="margin:0">${esc(b.name)}</h2></div>
      <div class="row" style="gap:8px"><a class="btn btn-soft btn-sm" href="../building.html?name=${encodeURIComponent(b.name)}" target="_blank" rel="noopener">View on the website ↗</a>${unitsIn(b.name).length ? "" : `<button class="btn btn-soft btn-sm" data-del-bldg style="color:#b3363a">Delete</button>`}</div></div>
    <div class="sec-grid">${BUILDING.map((x) => `<button type="button" class="sec-card" data-sec="${x.id}"><b>${esc(x.title)}</b><span class="prev">${esc(x.preview(b) || "")}</span>${icons.chevR}${x.thumb && b.photo ? `<span class="thumbs"><img src="${esc(thumb({ src: b.photo }))}" alt=""></span>` : ""}</button>`).join("")}</div>
    <section class="panel"><h2 class="ad-h2">Units in ${esc(b.name)}</h2>
      ${unitsIn(b.name).length ? `<table class="list">${unitsIn(b.name).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><span class="av av-${avOf(p)}">${esc(avText(p))}</span></td><td><button class="mini" data-prop="${esc(p.id)}" data-go="units">Edit</button></td></tr>`).join("")}</table>` : `<p class="muted small" style="margin:0">No units yet. In Units, open a unit's Location and choose ${esc(b.name)}.</p>`}
    </section>` : ""}
    ${loose.length ? `<p class="muted small">Not in a building: ${loose.map((p) => esc(p.name)).join(", ")}.</p>` : ""}`;
}
app.addEventListener("click", async (e) => {
  const sec = e.target.closest("[data-sec]");
  if (sec && S.tab === "units") return openEditor(LISTING.find((s) => s.id === sec.dataset.sec), "prop");
  if (sec && S.tab === "properties") return openEditor(BUILDING.find((s) => s.id === sec.dataset.sec), "building");
  if (sec && S.tab === "website") return openEditor(WEBSITE.find((s) => s.id === sec.dataset.sec), "site");
  if (e.target.closest("[data-add-prop]")) return addProperty();
  if (e.target.closest("[data-add-bldg]")) return addBuilding();
  if (e.target.closest("[data-del-bldg]")) return deleteBuilding();
});
// Building "More photos" ticks: keep { src, alt } copies in the draft, in the order of the grid.
$("#ed-body").addEventListener("change", (e) => {
  if (!e.target.matches("[data-bl-extra]") || ed.scope !== "building") return;
  const ticked = new Set($$("#ed-body [data-bl-extra]:checked").map((x) => x.value));
  ed.draft.photos = unitPhotos(ed.draft.name).filter((ph) => ticked.has(ph.src)).map(({ src, alt }) => ({ src, alt: alt || "" }));
  markDirty();
});
$("#ed-body").addEventListener("click", (e) => {
  if (!e.target.closest("[data-open-cal]")) return;
  if (ed.dirty && !confirm("Leave without saving your changes?")) return;
  ed.dirty = false; ed.dlg.close();
  S.tab = "calendar"; S.cal = {}; shell(); scrollTo(0, 0);
});
async function saveSite(next, message, done) {
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message });
    S.site = next; S.siteSha = r.siteSha; done?.(); render();
  } catch (err) { toast(err.message); }
}
async function addBuilding() {
  const name = prompt("Name of the building (for example: Avida Towers)")?.trim();
  if (!name) return;
  if (bldgs().some((b) => b.name.toLowerCase() === name.toLowerCase())) return toast(`${name} is already in Properties.`);
  const from = bldg() || {};
  const next = clone(S.site);
  (next.buildings ||= []).push({ name, area: "", locality: from.locality || "", province: from.province || "", description: [], neighborhood: "", amenities: [], photo: "", map: { google: "" } });
  await saveSite(next, `Add property ${name}`, () => { S.bldg = next.buildings.length - 1; toast(`${name} added. Add a photo and amenities, then pick it in a unit's Location.`); });
}
async function deleteBuilding() {
  const b = bldg();
  if (!confirm(`Delete ${b.name} from Properties? You can bring it back from Changes.`)) return;
  const next = clone(S.site);
  next.buildings.splice(S.bldg, 1);
  await saveSite(next, `Delete property ${b.name}`, () => { S.bldg = 0; toast(`${b.name} deleted.`); });
}
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
  const name = prompt("Name of the new unit (for example: One Oasis 12F)");
  if (!name?.trim()) return;
  let id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unit";
  while (S.site.properties.some((p) => p.id === id)) id += "-2";
  // A new place starts as an empty hidden draft. Only things likely shared with the current place
  // carry over (its building, location and house rules); photos, text, prices and reviews start blank.
  const from = prop();
  const p = {
    id, name: name.trim(), title: name.trim(), status: "hidden", availability: "available", availableFrom: "",
    kind: from.kind, category: from.category || "", city: from.city, locality: from.locality || "", province: from.province || "", building: from.building, area: from.area, address: from.address,
    map: clone(from.map), neighborhood: from.neighborhood || "",
    summary: "", description: [], size: "",
    guests: 2, bedrooms: 1, beds: 1, baths: 1,
    stayTypes: Object.fromEntries(Object.entries(from.stayTypes || {}).map(([t, s]) => [t, { price: 0, minNights: s.minNights, confirmed: false }])),
    addons: {}, cover: "", hero: "",
    tour: ["Bedroom", "Living room", "Kitchen", "Bathroom"].map((room) => ({ room, note: "", photos: [] })),
    hiddenPhotos: [], videos: [], rawVideos: [], sleeping: [], highlights: [],
    amenities: (from.amenities || []).filter((g) => g.group === "Building").map(clone), topAmenities: [],
    rules: clone(from.rules), faq: [],
    channels: { airbnb: { url: "", ical: "" }, booking: { url: "", ical: "" } },
  };
  if (!Object.keys(p.stayTypes).length) p.stayTypes = { nightly: { price: 0, minNights: 1, confirmed: false } };
  const next = clone(S.site);
  next.properties.push(p);
  try {
    const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Add property ${p.name} (hidden)` });
    S.site = next; S.siteSha = r.siteSha; S.prop = id;
    toast(`${p.name} added as a hidden draft in ${from.building || "the same place"} as ${from.name}. Add photos and the rent, then show it on the website.`);
    render();
  } catch (err) { toast(err.message); }
}

// ---------------- Website (site-wide) ----------------
// Site address, admin service, demo switch and analytics: set up once by the developer (admin/?dev).
const DEV = new URLSearchParams(location.search).has("dev");
const WEBSITE = [
  { id: "brand", title: "Business name", preview: (s) => `${s.brand} · ${s.tagline || ""}`, fields: [F("brand", "Business name"), F("tagline", "Tagline")] },
  { id: "home", title: "Home page", preview: (s) => s.home?.headline, fields: [
    F("home.headline", "Headline on the photo", "text", { hint: "One line. What you do and for whom." }),
    F("home.intro", "The line under “One team, from viewing to move-out”", "textarea", { rows: 3 }),
    F("home.promises", "Promises (the three short points)", "list", { hint: "Leave empty to use the standard three: ready on day one, one number, repairs handled. Only promise what you always do.", itemLabel: (x) => x.title || "New promise", addLabel: "Add a promise", def: { title: "", text: "" }, fields: [
      F("title", "Short title", "text", { placeholder: "Repairs, handled" }), F("text", "One sentence", "text", { placeholder: "Tell us what’s broken. We send someone." })] }),
    F("home.contactTitle", "Contact page title"), F("home.contactText", "Contact page text", "textarea", { rows: 2 }),
  ] },
  { id: "about", title: "About us", preview: (s) => (s.about?.length ? s.about[0] : "Written for you from your details"), fields: [
    F("about", "About text", "paras", { rows: 10, hint: "Shown on the About page; the first two paragraphs also go on the home page. Leave empty to use the standard text written from your name, years and reviews. Leave a blank line between paragraphs." }),
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
  { id: "host", title: "Team", preview: (s) => [s.host?.name, ...(s.host?.cohosts || [])].filter(Boolean).join(", "), fields: [
    { type: "row", fields: [F("host.name", "Name"), F("host.initial", "Initial (avatar)")] },
    F("host.yearsHosting", "Years renting out units", "number", { step: 1, hint: "Used in the standard About text." }),
    F("host.languages", "Languages", "lines", { rows: 3 }), F("host.cohosts", "The rest of the team", "lines", { rows: 3, hint: "First names, one per line." }),
  ] },
  { id: "advanced", dev: true, title: "Advanced", preview: (s) => (s.demo ? "Demo mode is on" : "Live mode"), fields: [
    F("demo", "Demo mode", "check", { hint: "Shows a “Demo preview” banner and sample bookings. Turn off for real guests." }),
    F("siteUrl", "Website address", "text", { input: "url", hint: "e.g. https://ckhaven.github.io/ckhavensuite/ (used for calendar links and share previews)" }),
    F("adminApi", "Admin service address", "text", { input: "url" }),
    F("analytics.goatcounter", "GoatCounter code (free visitor stats)", "text"),
  ] },
];
function renderWebsite() {
  $("#view").innerHTML = `
    <h1>Website</h1>
    <p class="ad-sub">The company side of the site: the home page, About, your team and how people reach you.</p>
    <div class="sec-grid">${WEBSITE.filter((s) => !s.dev || DEV).map((s) => `<button type="button" class="sec-card" data-sec="${s.id}"><b>${esc(s.title)}</b><span class="prev">${esc(s.preview(S.site) || "")}</span>${icons.chevR}</button>`).join("")}</div>`;
}

// ---------------- Inbox ----------------
// Two kinds of message, both kept private in the admin service (never in the public repo):
// "Messages" from the website's contact form (viewing requests, residents, questions), and
// "Owner leads" from the retired "List your property" form (shown only while old ones remain).
const WHO = { looking: "Looking for a place", viewing: "Wants a viewing", resident: "Resident", owner: "Unit owner", other: "Other" };
let REQ = { list: null, filter: "new", error: "" };
const INBOX = { kind: "messages", list: null, filter: "new", error: "" };
const peso = (n) => (n ? money(S.site, n) : "");
async function loadRequests() {
  try { REQ.list = (await api("GET", "/api/submissions")).submissions; REQ.error = ""; }
  catch (err) { REQ.list = []; REQ.error = err.message; }
}
async function loadEnquiries() {
  try { INBOX.list = (await api("GET", "/api/enquiries")).enquiries; INBOX.error = ""; }
  catch (err) { INBOX.list = []; INBOX.error = err.message; }
}
async function renderInbox() {
  $("#view").innerHTML = `<h1>Inbox</h1><p class="ad-sub">Loading…</p>`;
  if (!isOwner()) INBOX.kind = "messages";
  await Promise.all([loadEnquiries(), isOwner() ? loadRequests() : null]);
  drawInbox();
}
const drawRequests = () => drawInbox();
function drawInbox() {
  const newMsgs = (INBOX.list || []).filter((x) => x.status === "new").length;
  const newLeads = (REQ.list || []).filter((x) => x.status === "new").length;
  $("#view").innerHTML = `
    <h1>Inbox</h1>
    <p class="ad-sub">${INBOX.kind === "leads" ? "Owners who filled in “List your property”. Nothing goes on the website until you add it and show it." : "Messages sent from the website's contact form. The sender also opened their own chat app, so they may have messaged you there too."}</p>
    ${isOwner() && (REQ.list?.length || REQ.error) && !/switched on/i.test(REQ.error) ? `<div class="seg" role="tablist">${[["messages", "Messages", newMsgs], ["leads", "Owner leads", newLeads]].map(([k, l, n]) => `<button type="button" role="tab" data-inbox="${k}" aria-selected="${INBOX.kind === k}">${l}${n ? ` <span class="badge">${n}</span>` : ""}</button>`).join("")}</div>` : ""}
    <div id="inbox-body"></div>`;
  $("#inbox-body").innerHTML = INBOX.kind === "leads" ? leadsHTML() : messagesHTML();
}
const offHTML = (what, until) => `<section class="panel"><b>${what} aren't switched on yet</b><p class="muted small" style="margin:6px 0 0">${until} To collect them here, add the SUBMISSIONS storage to the admin service (see README → Host admin).</p></section>`;
function messagesHTML() {
  if (INBOX.error) return /switched on/i.test(INBOX.error) ? offHTML("Website messages", "Until they are, contact-form messages only reach you in Messenger, WhatsApp, Viber or email.") : `<section class="panel"><b>Couldn't load messages</b><p class="muted small" style="margin:6px 0 0">${esc(INBOX.error)}</p></section>`;
  const all = INBOX.list || [];
  const n = (k) => all.filter((x) => x.status === k).length;
  const shown = all.filter((x) => x.status === INBOX.filter);
  return `<div class="chips" role="group" aria-label="Show">${["new", "done"].map((k) => `<button type="button" data-enq-filter="${k}" aria-pressed="${INBOX.filter === k}">${{ new: "To answer", done: "Done" }[k]} (${n(k)})</button>`).join("")}</div>
    ${shown.length ? shown.map(enquiryCard).join("") : `<section class="panel"><p class="muted" style="margin:0">${INBOX.filter === "new" ? "All caught up." : "Nothing here yet."}</p></section>`}`;
}
function enquiryCard(q) {
  const unit = S.site.properties.find((p) => p.id === q.unit);
  const num = String(q.phone || "").replace(/[^\d+]/g, "");
  return `<section class="panel req-card" data-enq="${esc(q.id)}">
    <div class="req-head"><div><b>${esc(q.name)}</b><div class="muted small">${esc(WHO[q.who] || "Message")}${unit ? ` · ${esc(unit.name)}` : ""} · ${timeAgo(q.date)}${q.status === "done" && q.handledBy ? ` · answered by ${esc(q.handledBy)}` : ""}</div></div>
      ${unit && isOwner() ? `<button class="btn btn-soft btn-sm" data-prop="${esc(unit.id)}" data-go="units">Open unit</button>` : ""}</div>
    <p class="enq-msg">${esc(q.msg)}</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px">
      ${num ? `<a class="btn btn-soft btn-sm" href="tel:${esc(num)}">${icons.phone} Call ${esc(q.phone)}</a><a class="btn btn-soft btn-sm" href="sms:${esc(num)}">Text</a><a class="btn btn-soft btn-sm" href="https://wa.me/${esc(num.replace("+", ""))}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted small">No number given: they'll have written to you in their chat app.</span>`}
      <span style="flex:1"></span>
      ${q.status === "new" ? `<button class="btn btn-dark btn-sm" data-enq-status="done">Mark as done</button>` : `<button class="btn btn-soft btn-sm" data-enq-status="new">Move back</button>`}
      <button class="mini danger" data-enq-delete>Delete</button>
    </div>
  </section>`;
}
function leadsHTML() {
  if (REQ.error) return /switched on/i.test(REQ.error) ? offHTML("Owner leads", "Until they are, the form on the website sends the details to you by Messenger, WhatsApp, Viber or email.") : `<section class="panel"><b>Couldn't load owner leads</b><p class="muted small" style="margin:6px 0 0">${esc(REQ.error)}</p></section>`;
  const all = REQ.list || [];
  const counts = { new: 0, approved: 0, rejected: 0 };
  all.forEach((s) => (counts[s.status] = (counts[s.status] || 0) + 1));
  const shown = all.filter((s) => s.status === REQ.filter);
  return `<div class="chips" role="group" aria-label="Show">${["new", "approved", "rejected"].map((k) => `<button type="button" data-req-filter="${k}" aria-pressed="${REQ.filter === k}">${{ new: "New", approved: "Added", rejected: "Declined" }[k]} (${counts[k] || 0})</button>`).join("")}</div>
    ${shown.length ? shown.map(requestCard).join("") : `<section class="panel"><p class="muted" style="margin:0">${REQ.filter === "new" ? "No new owner leads." : "None here."}</p></section>`}`;
}
app.addEventListener("click", async (e) => {
  if (S.tab !== "inbox") return;
  const k = e.target.closest("[data-inbox]");
  if (k) { INBOX.kind = k.dataset.inbox; return drawInbox(); }
  const fl = e.target.closest("[data-enq-filter]");
  if (fl) { INBOX.filter = fl.dataset.enqFilter; return drawInbox(); }
  const card = e.target.closest("[data-enq]");
  if (!card) return;
  const q = INBOX.list.find((x) => x.id === card.dataset.enq);
  const btn = e.target.closest("button");
  try {
    const st = e.target.closest("[data-enq-status]");
    if (st) { btn.disabled = true; await api("POST", "/api/enquiries/status", { id: q.id, status: st.dataset.enqStatus }); await loadEnquiries(); return drawInbox(); }
    if (e.target.closest("[data-enq-delete]")) {
      if (!confirm(`Delete the message from ${q.name}? It's removed for good.`)) return;
      await api("DELETE", "/api/enquiries", { id: q.id }); await loadEnquiries(); drawInbox();
    }
  } catch (err) { toast(err.message); if (btn) btn.disabled = false; }
});
function requestCard(s) {
  const where = [s.building, s.area, s.locality, s.province].filter(Boolean).join(", ");
  const prices = [s.nightly && `${peso(s.nightly)}/night`, s.monthly && `${peso(s.monthly)}/month`, s.salePrice && `${peso(s.salePrice)} asking`].filter(Boolean).join(" · ");
  const num = (v) => String(v || "").replace(/[^\d+]/g, "");
  const reach = [
    s.phone && `<a class="btn btn-soft btn-sm" href="tel:${esc(num(s.phone))}">${icons.phone} ${esc(s.phone)}</a>`,
    s.whatsapp && `<a class="btn btn-soft btn-sm" href="https://wa.me/${esc(num(s.whatsapp).replace("+", ""))}" target="_blank" rel="noopener">WhatsApp</a>`,
    s.messenger && `<a class="btn btn-soft btn-sm" href="https://m.me/${esc(s.messenger)}" target="_blank" rel="noopener">Messenger</a>`,
    s.email && `<a class="btn btn-soft btn-sm" href="mailto:${esc(s.email)}">${icons.mail} Email</a>`,
  ].filter(Boolean).join("");
  const safeLinks = (text) => esc(text).replace(/https:\/\/[^\s<>"']+/g, (u) => `<a class="u" href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  return `<section class="panel req-card" data-req="${esc(s.id)}">
    <div class="req-head"><div><b>${esc(s.title)}</b><div class="muted small">${esc(s.modes.map((m) => MODES[m]?.one || m).join(" · "))} · ${esc(CATEGORIES.find(([k]) => k === s.category)?.[1] || "Property")} · ${timeAgo(s.date)}${s.status !== "new" && s.decidedBy ? ` · ${s.status === "approved" ? "approved" : "declined"} by ${esc(s.decidedBy)}` : ""}</div></div>${s.status === "approved" && s.propertyId ? `<button class="btn btn-soft btn-sm" data-req-open="${esc(s.propertyId)}">Open listing</button>` : ""}</div>
    <dl class="req-dl">
      <dt>Where</dt><dd>${esc(where)}</dd>
      ${[s.bedrooms && `${s.bedrooms} bedroom(s)`, s.baths && `${s.baths} bath(s)`, s.guests && `sleeps ${s.guests}`, s.size && `floor ${esc(s.size)}`, s.lotArea && `lot ${esc(s.lotArea)}`].filter(Boolean).length ? `<dt>Size</dt><dd>${[s.bedrooms && `${s.bedrooms} bedroom(s)`, s.baths && `${s.baths} bath(s)`, s.guests && `sleeps ${s.guests}`, s.size && `floor ${esc(s.size)}`, s.lotArea && `lot ${esc(s.lotArea)}`].filter(Boolean).join(" · ")}</dd>` : ""}
      ${prices ? `<dt>Prices</dt><dd>${prices}</dd>` : ""}
      ${s.pets ? `<dt>Pets</dt><dd>${{ yes: "Allowed", no: "Not allowed", ask: "Depends, ask the owner" }[s.pets] || ""}</dd>` : ""}
      ${s.manage ? `<dt>Management</dt><dd><b>Wants to ask about ${esc(S.site.brand)} managing it</b></dd>` : ""}
      ${s.description ? `<dt>About</dt><dd style="white-space:pre-wrap">${esc(s.description)}</dd>` : ""}
      ${s.photos ? `<dt>Photos</dt><dd>${safeLinks(s.photos)}</dd>` : ""}
      ${s.links ? `<dt>Links</dt><dd>${safeLinks(s.links)}</dd>` : ""}
      <dt>From</dt><dd>${esc(s.name)} · ${esc(s.role)}</dd>
    </dl>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0">${reach}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px">
      ${s.status !== "approved" ? `<button class="btn btn-primary btn-sm" data-req-approve>Add as a hidden unit</button>` : ""}
      ${s.status === "new" ? `<button class="btn btn-soft btn-sm" data-req-status="rejected">Decline</button>` : `<button class="btn btn-soft btn-sm" data-req-status="new">Move back to New</button>`}
      <button class="mini danger" data-req-delete>Delete</button>
    </div>
  </section>`;
}
/** A submission → a hidden draft listing. Only what the owner sent; photos, rules and the rest are added in Listing. */
function propertyFromRequest(s) {
  let id = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "listing";
  while (S.site.properties.some((p) => p.id === id)) id = `${id.slice(0, 44)}-${Math.random().toString(36).slice(2, 5)}`;
  const label = CATEGORIES.find(([k]) => k === s.category)?.[1] || "Property";
  const paras = s.description.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const p = {
    id, name: s.title.slice(0, 60), title: s.title, status: "hidden",
    kind: s.category === "room" ? "Private room" : `Entire ${label.toLowerCase()}`, category: s.category,
    building: s.building, area: s.area, address: "", city: `${s.locality}, Philippines`, locality: s.locality, province: s.province,
    summary: (paras[0] || "").split(/(?<=\.)\s/)[0].slice(0, 200), description: paras, size: s.size,
    guests: s.guests || 0, bedrooms: s.bedrooms || 0, beds: s.bedrooms || 0, baths: s.baths || 0, ...(s.pets ? { pets: s.pets } : {}),
    stayTypes: {
      ...(s.modes.includes("stay") ? { nightly: { price: s.nightly || 0, minNights: 1, confirmed: false } } : {}),
      ...(s.modes.includes("rent") ? { monthly: { price: s.monthly || 0, minNights: 30, note: "", confirmed: false } } : {}),
    },
    ...(s.modes.includes("sale") ? { sale: { price: s.salePrice || 0, negotiable: false, floorArea: s.size, lotArea: s.lotArea, documents: "", financing: "", note: "" } } : {}),
    owner: { name: s.name, role: s.role, phone: s.phone, whatsapp: s.whatsapp, viber: s.viber, messenger: s.messenger, email: s.email, responseTime: "", bio: "" },
    addons: {}, cover: "", hero: "",
    tour: ["Living area", "Bedroom", "Kitchen", "Bathroom", "Outside"].map((room) => ({ room, note: "", photos: [] })),
    hiddenPhotos: [], videos: [], rawVideos: [], sleeping: [], highlights: [], amenities: [], topAmenities: [], faq: [],
    channels: { airbnb: { url: "", ical: "" }, booking: { url: "", ical: "" } },
  };
  if (s.modes.includes("stay")) p.rules = { checkIn: "", checkOut: "", maxGuests: s.guests || 0, cancellation: "" };
  return p;
}
app.addEventListener("click", async (e) => {
  if (S.tab !== "inbox") return;
  const fl = e.target.closest("[data-req-filter]");
  if (fl) { REQ.filter = fl.dataset.reqFilter; return drawRequests(); }
  const op = e.target.closest("[data-req-open]");
  if (op) { S.prop = op.dataset.reqOpen; S.tab = "units"; shell(); scrollTo(0, 0); return; }
  const card = e.target.closest("[data-req]");
  if (!card) return;
  const s = REQ.list.find((x) => x.id === card.dataset.req);
  const btn = e.target.closest("button");
  try {
    if (e.target.closest("[data-req-approve]")) {
      btn.disabled = true; btn.textContent = "Adding…";
      const p = propertyFromRequest(s);
      const next = clone(S.site);
      next.properties.push(p);
      const r = await api("PUT", "/api/site", { site: next, sha: S.siteSha, message: `Add ${p.name} from a listing request (hidden)` });
      S.site = next; S.siteSha = r.siteSha;
      await api("POST", "/api/submissions/status", { id: s.id, status: "approved", propertyId: p.id });
      toast(`${p.name} added as a hidden draft with ${s.name} recorded as the owner. Add photos and check the details, then show it on the website.`);
      S.prop = p.id; S.tab = "units"; shell(); scrollTo(0, 0);
      return;
    }
    const st = e.target.closest("[data-req-status]");
    if (st) { await api("POST", "/api/submissions/status", { id: s.id, status: st.dataset.reqStatus }); await loadRequests(); return drawRequests(); }
    if (e.target.closest("[data-req-delete]")) {
      if (!confirm(`Delete the request for ${s.title}? Their details are removed for good.`)) return;
      await api("DELETE", "/api/submissions", { id: s.id }); await loadRequests(); drawRequests();
    }
  } catch (err) { toast(err.message); if (btn) btn.disabled = false; }
});

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
