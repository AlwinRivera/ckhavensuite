// Checks everything an admin saves before it is published, so a typo can't break the
// site and nothing unsafe (javascript: links, paths outside assets/) gets in.
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

const URL_KEYS = new Set(["url", "google", "facebook", "instagram", "ical", "siteUrl", "adminApi"]);
const ASSET_KEYS = new Set(["src", "poster", "cover", "hero", "photo"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function walk(v, path) {
  if (typeof v === "string") {
    if (v.length > 6000) throw bad(`${path} is too long.`);
    const key = path.split(".").pop().replace(/\[\d+\]$/, "");
    if (URL_KEYS.has(key) && v && !/^https:\/\/[^\s<>"']+$/i.test(v) && !(key === "adminApi" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v))) {
      throw bad(`${path} must be a web link starting with https://`);
    }
    if (ASSET_KEYS.has(key) && v && (!/^assets\/[A-Za-z0-9._\/-]+$/.test(v) || v.includes(".."))) throw bad(`${path} must be a photo or video from the site's assets folder.`);
  } else if (Array.isArray(v)) {
    if (v.length > 300) throw bad(`${path} has too many items.`);
    v.forEach((x, i) => walk(x, `${path}[${i}]`));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  } else if (typeof v === "number" && !Number.isFinite(v)) {
    throw bad(`${path} must be a number.`);
  }
}

const num = (v, path, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw bad(`${path} must be a number from ${min} to ${max}.`);
};

export function validateSite(site) {
  if (!site || typeof site !== "object" || Array.isArray(site)) throw bad("The site data is missing.");
  if (JSON.stringify(site).length > 400000) throw bad("The site data is too big.");
  walk(site, "");
  if (!site.brand || typeof site.brand !== "string") throw bad("The business name can't be empty.");
  const c = site.contact || {};
  for (const k of ["phone", "whatsapp", "viber"]) if (c[k] && !/^[+\d\s()-]{0,24}$/.test(c[k])) throw bad(`Contact ${k} can only contain digits, spaces and +.`);
  if (c.messenger && !/^[A-Za-z0-9.]{1,64}$/.test(c.messenger)) throw bad("Messenger page name can only contain letters, numbers and dots.");
  if (c.email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(c.email)) throw bad("That email address doesn't look right.");
  if (!Array.isArray(site.properties) || !site.properties.length) throw bad("There must be at least one property.");
  if (site.properties.length > 30) throw bad("Too many properties.");
  const ids = new Set();
  site.properties.forEach((p, i) => {
    const at = `Property ${i + 1}`;
    if (!/^[a-z0-9-]{2,48}$/.test(p.id || "")) throw bad(`${at}: the web address name must be lowercase letters, numbers and dashes.`);
    if (ids.has(p.id)) throw bad(`${at}: another property already uses "${p.id}".`);
    ids.add(p.id);
    if (!p.title || !p.name) throw bad(`${at}: the name and title can't be empty.`);
    const types = Object.entries(p.stayTypes || {});
    if (!types.length) throw bad(`${p.name}: offer at least short stays or monthly rentals.`);
    for (const [t, st] of types) {
      if (!["nightly", "monthly"].includes(t)) throw bad(`${p.name}: unknown stay type ${t}.`);
      num(st.price, `${p.name} ${t} price`, 0, 10000000);
      num(st.minNights, `${p.name} ${t} minimum nights`, 1, 365);
    }
    for (const k of ["guests", "bedrooms", "beds", "baths"]) num(p[k], `${p.name} ${k}`, 0, 50);
    if (p.map) { num(p.map.lat, `${p.name} latitude`, -90, 90); num(p.map.lon, `${p.name} longitude`, -180, 180); }
    if (!Array.isArray(p.tour) || !p.tour.some((r) => r.photos?.length)) throw bad(`${p.name}: add at least one photo.`);
  });
  return site;
}

export function validateBooking(b, site) {
  if (!site.properties.some((p) => p.id === b.property)) throw bad("Unknown property.");
  if (!ISO.test(b.start || "") || !ISO.test(b.end || "")) throw bad("Pick a check-in and a checkout date.");
  const nights = (Date.parse(b.end) - Date.parse(b.start)) / 864e5;
  if (!(nights >= 1 && nights <= 366)) throw bad("A booking must be 1 to 366 nights.");
  const label = String(b.label || "Direct booking").slice(0, 60);
  return { property: b.property, start: b.start, end: b.end, label };
}

/** Uploaded photo bytes must really be JPEG or WebP. */
export function checkImage(base64, kind) {
  if (typeof base64 !== "string" || base64.length > 6_000_000) throw bad("Each photo must be under 4 MB.");
  const head = atob(base64.slice(0, 24));
  const isJpg = head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8;
  const isWebp = head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
  if (kind === "jpg" ? !isJpg : !(isWebp || isJpg)) throw bad("That file isn't a photo we can use. Try a JPG or PNG.");
  return isWebp ? "webp" : "jpg";
}
