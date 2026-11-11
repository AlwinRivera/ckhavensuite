import { loadData, $, esc, demoBar, footer, monthHTML, bookedNights, todayISO, pretty, nightsBetween, timeAgo } from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
footer(site);

const names = { airbnb: "Airbnb", booking: "Booking.com", direct: "Direct" };
const statusText = { ok: "Synced", demo: "Demo data (no iCal link yet)", error: "Sync failed, check the link", "not-configured": "No iCal link" };
const today = todayISO();
$("#updated").textContent = avail.updated ? `Calendars are checked every hour. Bookings last changed ${timeAgo(avail.updated)} (${new Date(avail.updated).toLocaleString()}).` : "Not synced yet.";
const hr = new Date().getHours();
$("#greet").textContent = `Good ${hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"}, ${site.host?.name?.split(" ")[0] || "host"}`;

// "Today" summary across every unit, like a host app's home tab.
const all = site.properties.flatMap((p) => (avail.properties?.[p.id]?.booked || []).map((b) => ({ ...b, unit: p.name })));
const ins = all.filter((b) => b.start === today), outs = all.filter((b) => b.end === today);
const next = all.filter((b) => b.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
const staying = all.find((b) => b.start <= today && b.end > today);
const per = (a, b) => nightsBetween(a, b);
const bookedNext30 = site.properties.reduce((n, p) => n + [...bookedNights(avail, p.id).keys()].filter((d) => d >= today && per(today, d) < 30).length, 0);
$("#today").innerHTML = [
  ["Checking in today", ins.length ? ins.map((b) => names[b.source]).join(", ") : "No one"],
  ["Checking out today", outs.length ? outs.map((b) => names[b.source]).join(", ") : "No one"],
  ["Currently hosting", staying ? `${names[staying.source]} guest until ${pretty(staying.end)}` : "Unit is free"],
  ["Next arrival", next ? `${pretty(next.start, { weekday: "short", month: "short", day: "numeric" })} · ${names[next.source]}` : "None yet"],
  ["Occupancy, next 30 days", `${Math.round((bookedNext30 / (30 * site.properties.length)) * 100)}%`],
].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("");

$("#props").innerHTML = site.properties.map((p) => {
  const data = avail.properties?.[p.id] || { channels: {}, booked: [] };
  const src = bookedNights(avail, p.id);

  const now = new Date();
  const months = [0, 1, 2].map((i) => {
    const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return monthHTML(m.getFullYear(), m.getMonth(), (d) => ({
      cls: [src.has(d) ? `src-${src.get(d)}` : "", d < today ? "past" : "", d === today ? "today" : ""].join(" "),
      disabled: true,
      title: src.has(d) ? names[src.get(d)] : "",
    }));
  }).join("");

  const upcoming = data.booked.filter((b) => b.end > today);
  const nights30 = [...src.keys()].filter((d) => d >= today && nightsBetween(today, d) < 30).length;
  const icsUrl = new URL(`ical/${p.id}.ics`, location.href).href;

  return `
    <section class="panel">
      <div class="section-head" style="margin-bottom:16px">
        <div><h2 style="font-size:1.5rem;margin:0">${esc(p.name)}</h2><span class="muted small">${nights30} of next 30 nights booked</span></div>
        <a class="btn btn-ghost btn-sm" href="property.html?id=${encodeURIComponent(p.id)}">Public page ↗</a>
      </div>
      <div class="owner-cal">${months}</div>

      <h3 style="margin-top:28px">Upcoming stays</h3>
      <table class="list">
        <tr><th>Channel</th><th>Check in</th><th>Check out</th><th>Nights</th></tr>
        ${upcoming.map((b) => `<tr><td><span class="dot" style="background:var(--${b.source})"></span> ${names[b.source]}</td><td>${pretty(b.start, { weekday: "short", month: "short", day: "numeric" })}</td><td>${pretty(b.end, { weekday: "short", month: "short", day: "numeric" })}</td><td>${nightsBetween(b.start, b.end)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No upcoming stays.</td></tr>`}
      </table>

      <h3 style="margin-top:28px">Channel sync</h3>
      <table class="list">
        ${Object.entries(data.channels).map(([k, v]) => `<tr><td>${names[k] || esc(k)}</td><td class="status-${v}">${statusText[v] || esc(v)}</td></tr>`).join("")}
        <tr><td>Our calendar for Airbnb/Booking to import</td><td><code>${esc(icsUrl)}</code></td></tr>
      </table>
    </section>`;
}).join("");
