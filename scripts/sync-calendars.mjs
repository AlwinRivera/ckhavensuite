// Pulls Airbnb / Booking.com iCal feeds, merges direct bookings, and writes:
//   data/availability.json   -> read by the website
//   ical/<property-id>.ics   -> paste this URL into Airbnb/Booking "Import calendar"
// No dependencies. Runs in GitHub Actions (Node 20+) or locally: node scripts/sync-calendars.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));

async function writeIfChanged(path, text) {
  const url = new URL(path, root);
  const old = await readFile(url, "utf8").catch(() => null);
  if (old === text) return false;
  await writeFile(url, text);
  return true;
}

const site = await read("data/site.json");
const direct = await read("data/direct-bookings.json");

const toISO = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function parseICS(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") ev = {};
    else if (line === "END:VEVENT") {
      if (ev?.start && ev?.end) events.push(ev);
      ev = null;
    } else if (ev) {
      const m = line.match(/^(DTSTART|DTEND)[^:]*:(\d{8})/);
      if (m) ev[m[1] === "DTSTART" ? "start" : "end"] = toISO(m[2]);
    }
  }
  return events;
}

// Sample feed data so the demo calendar isn't empty before real iCal links exist.
// Anchored to the Monday of the current week so the file changes once a week, not every run.
function demoEvents(source) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const monday = now.toISOString().slice(0, 10);
  const offsets = source === "airbnb" ? [[3, 6], [18, 21], [40, 44]] : [[9, 12], [30, 33], [52, 55]];
  return offsets.map(([a, b]) => ({ start: addDays(monday, a), end: addDays(monday, b) }));
}

const out = { updated: "", demo: !!site.demo, properties: {} };
await mkdir(new URL("ical/", root), { recursive: true });

for (const p of site.properties) {
  const booked = [];
  const channels = {};
  const mine = direct.filter((d) => d.property === p.id);
  const overlaps = (e) => [...mine, ...booked].some((d) => e.start < d.end && d.start < e.end);
  for (const [source, cfg] of Object.entries(p.channels || {})) {
    if (!cfg.ical) {
      channels[source] = site.demo ? "demo" : "not-configured";
      if (site.demo) demoEvents(source).filter((e) => !overlaps(e)).forEach((e) => booked.push({ ...e, source }));
      continue;
    }
    try {
      const res = await fetch(cfg.ical, { headers: { "User-Agent": "calendar-sync" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parseICS(await res.text()).forEach((e) => booked.push({ ...e, source }));
      channels[source] = "ok";
    } catch (err) {
      console.error(`${p.id} ${source}: ${err.message}`);
      channels[source] = "error";
    }
  }
  mine.forEach((d) => booked.push({ start: d.start, end: d.end, source: "direct" }));
  booked.sort((a, b) => a.start.localeCompare(b.start));
  out.properties[p.id] = { channels, booked };

  // Export ONLY direct bookings, so Airbnb/Booking block them without echoing their own.
  // DTSTAMP is derived from the booking itself so an unchanged calendar produces an identical file.
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CK Haven//Direct bookings//EN", "CALSCALE:GREGORIAN",
    ...mine.flatMap((d, i) => [
      "BEGIN:VEVENT",
      `UID:${p.id}-${d.start}-${i}@ckhaven`,
      `DTSTAMP:${d.start.replace(/-/g, "")}T000000Z`,
      `DTSTART;VALUE=DATE:${d.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${d.end.replace(/-/g, "")}`,
      "SUMMARY:Reserved (direct)",
      "END:VEVENT",
    ]),
    "END:VCALENDAR", "",
  ].join("\r\n");
  await writeIfChanged(`ical/${p.id}.ics`, ics);
}

// Only touch availability.json when booked dates or channel status actually changed,
// so the hourly job commits nothing on a quiet day. "updated" = when the data last changed.
const prev = await readFile(new URL("data/availability.json", root), "utf8").then(JSON.parse).catch(() => null);
const same = prev && JSON.stringify({ ...prev, updated: "" }) === JSON.stringify(out);
out.updated = same ? prev.updated : new Date().toISOString();
const changed = !same && (await writeIfChanged("data/availability.json", JSON.stringify(out, null, 2) + "\n"));
console.log(changed ? "Bookings changed, files updated." : "No changes.");
