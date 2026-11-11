// Shared helpers for every page. No build step, no dependencies.
export async function loadData() {
  const [site, avail] = await Promise.all([
    fetch("data/site.json").then((r) => r.json()),
    fetch("data/availability.json").then((r) => r.json()).catch(() => ({ properties: {} })),
  ]);
  initAnalytics(site);
  markJpgOnly(site);
  return { site, avail };
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const money = (site, n) => `${site.currency}${Math.round(Number(n)).toLocaleString("en-PH")}`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Photos uploaded from a browser that can't encode WebP have -640.jpg / -1280.jpg sizes instead. */
const jpgOnly = new Set();
export function markJpgOnly(site) {
  for (const p of site.properties || []) for (const r of p.tour || []) for (const ph of r.photos || []) if (ph.webp === false) jpgOnly.add(ph.src);
}

/** Responsive <picture>: assets/img/x.jpg -> x-640.webp / x-1280.webp with jpg fallback. */
export function pic(src, alt, { sizes = "100vw", lazy = true, cls = "" } = {}) {
  const base = src.replace(/\.jpe?g$/i, "");
  const hasWebp = base !== src && src.startsWith("assets/img/");
  const jpgSizes = jpgOnly.has(src) ? ` srcset="${esc(base)}-640.jpg 640w, ${esc(base)}-1280.jpg 1280w" sizes="${sizes}"` : "";
  const img = `<img src="${esc(src)}"${jpgSizes} alt="${esc(alt)}" ${lazy ? 'loading="lazy" decoding="async"' : 'fetchpriority="high"'} ${cls ? `class="${cls}"` : ""}>`;
  if (!hasWebp || jpgOnly.has(src)) return img;
  return `<picture><source type="image/webp" srcset="${esc(base)}-640.webp 640w, ${esc(base)}-1280.webp 1280w" sizes="${sizes}">${img}</picture>`;
}

// ---- dates (ISO yyyy-mm-dd, local, timezone-safe) ----
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const todayISO = () => iso(new Date());
export const pretty = (s, opts = { month: "short", day: "numeric" }) => (s ? parse(s).toLocaleDateString("en-US", opts) : "");

/** Map of every booked night -> source ("airbnb" | "booking" | "direct"). */
export function bookedNights(avail, id) {
  const map = new Map();
  for (const b of avail.properties?.[id]?.booked || []) {
    for (let d = b.start; d < b.end; d = addDays(d, 1)) map.set(d, b.source);
  }
  return map;
}
export function rangeIsFree(booked, start, end) {
  for (let d = start; d < end; d = addDays(d, 1)) if (booked.has(d)) return false;
  return true;
}
export function nextFreeNight(booked, from = todayISO()) {
  let d = from;
  for (let i = 0; i < 365 && booked.has(d); i++) d = addDays(d, 1);
  return d;
}

/** One month grid. dayClass(iso) -> { cls, disabled, title }. */
export function monthHTML(year, month, dayClass) {
  const first = new Date(year, month, 1);
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const days = new Date(year, month + 1, 0).getDate();
  let cells = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<div class="dow">${d}</div>`).join("");
  cells += "<div></div>".repeat(first.getDay());
  for (let i = 1; i <= days; i++) {
    const s = iso(new Date(year, month, i));
    const { cls = "", disabled = false, title = "" } = dayClass(s);
    const aria = `${parse(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${title ? `, ${title}` : ""}`;
    cells += `<button type="button" class="day ${cls}" data-date="${s}" ${disabled ? "disabled" : ""} aria-label="${esc(aria)}"><span>${i}</span></button>`;
  }
  return `<div class="cal" data-month="${iso(first).slice(0, 7)}"><h4>${label}</h4><div class="cal-grid">${cells}</div></div>`;
}

// ---- contact channels ----
export function channelList(site, message) {
  const c = site.contact || {};
  const t = encodeURIComponent(message);
  const num = (v) => (v || "").replace(/[^\d+]/g, "");
  const list = [
    c.messenger && { key: "messenger", label: "Messenger", sub: "Facebook page chat", color: "#0866ff", icon: icons.ms, url: `https://m.me/${c.messenger}`, paste: true },
    c.whatsapp && { key: "whatsapp", label: "WhatsApp", sub: c.phone, color: "#25d366", icon: icons.wa, url: `https://wa.me/${num(c.whatsapp).replace("+", "")}?text=${t}` },
    c.viber && { key: "viber", label: "Viber", sub: c.phone, color: "#7360f2", icon: icons.viber, url: `viber://chat?number=${encodeURIComponent(num(c.viber))}`, paste: true },
    c.phone && { key: "sms", label: "Text message", sub: c.phone, color: "#3a3a3a", icon: icons.sms, url: `sms:${num(c.phone)}?&body=${t}` },
    c.email && { key: "email", label: "Email", sub: c.email, color: "#c25b73", icon: icons.mail, url: `mailto:${c.email}?subject=${encodeURIComponent("Booking request")}&body=${t}` },
    c.phone && { key: "call", label: "Call", sub: c.phone, color: "#4f7a5a", icon: icons.phone, url: `tel:${num(c.phone)}` },
  ];
  return list.filter(Boolean);
}

/** Copy the request to the clipboard (Messenger/Viber can't pre-fill text) and open the channel. */
export function openChannel(ch, message) {
  navigator.clipboard?.writeText(message).catch(() => {});
  track(`contact-${ch.key}`);
  if (ch.paste) toast(`Your request is copied. Paste it into ${ch.label} and send.`);
  window.open(ch.url, ch.url.startsWith("http") ? "_blank" : "_self", "noopener");
}

// ---- analytics (GoatCounter, free; inert until a code is set in site.json) ----
function initAnalytics(site) {
  const code = site.analytics?.goatcounter;
  if (!code || location.hostname === "localhost") return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.append(s);
}
export function track(name) {
  window.goatcounter?.count?.({ path: `event/${name}`, title: name, event: true });
}

// ---- UI bits ----
let toastTimer;
export function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4500);
}

export function demoBar(site) {
  if (!site.demo) return;
  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.innerHTML = "<b>Demo preview</b>: booked dates are samples and prices are estimates until the owner confirms them.";
  document.body.prepend(bar);
}

export function footer(site) {
  const c = site.contact || {};
  const el = $(".site-footer .wrap");
  if (!el) return;
  el.innerHTML = `
    <div>
      <div>© ${new Date().getFullYear()} ${esc(site.brand)} · One Oasis, Cagayan de Oro</div>
      <div class="xs" style="margin-top:4px">${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a> · ` : ""}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</div>
    </div>
    <div class="socials">
      ${c.facebook ? `<a href="${esc(c.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icons.fb}</a>` : ""}
      ${c.instagram ? `<a href="${esc(c.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${icons.ig}</a>` : ""}
      ${c.messenger ? `<a href="https://m.me/${esc(c.messenger)}" target="_blank" rel="noopener" aria-label="Messenger">${icons.ms}</a>` : ""}
    </div>`;
}

export function timeAgo(isoStr) {
  if (!isoStr) return "";
  const mins = Math.round((Date.now() - new Date(isoStr)) / 6e4);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function starsHTML(n) {
  return `<span class="stars" aria-label="${n} stars">${icons.star.repeat(Math.round(n))}</span>`;
}

/** Pick an icon for an amenity label by keyword. */
export function amenityIcon(label) {
  const l = label.toLowerCase();
  const map = [["pool", "pool"], ["garden", "leaf"], ["patio", "leaf"], ["outdoor", "leaf"], ["wi-fi", "wifi"], ["tv", "tv"], ["air", "snow"], ["induction", "flame"], ["stove", "flame"], ["fridge", "fridge"], ["refrigerator", "fridge"], ["microwave", "microwave"], ["shower", "shower"], ["parking", "car"], ["water", "drop"], ["security", "shield"], ["smoke", "alarm"], ["carbon", "alarm"], ["fire", "extinguisher"], ["bed", "bed"], ["linen", "bed"], ["towel", "towel"], ["kit", "gift"], ["locker", "closet"], ["kids", "kid"], ["utensil", "utensils"], ["stool", "utensils"]];
  const hit = map.find(([k]) => l.includes(k));
  return icons[hit ? hit[1] : "check"];
}

const S = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icons = {
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="star"><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8Z"/></svg>',
  check: S('<path d="M20 6 9 17l-5-5"/>'),
  x: S('<path d="M18 6 6 18M6 6l12 12"/>', 'stroke-width="2.2"'),
  chevL: S('<path d="m15 18-6-6 6-6"/>', 'stroke-width="2.4"'),
  chevR: S('<path d="m9 18 6-6-6-6"/>', 'stroke-width="2.4"'),
  heart: S('<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.4 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.4h2C13.8 6.1 15.2 5 17.2 5c3.5 0 5.6 3.4 4.3 6.7C19.5 16.4 12 21 12 21Z"/>'),
  share: S('<path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  grid: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  pool: S('<path d="M2 18c1.7 0 1.7-1 3.3-1s1.7 1 3.4 1 1.6-1 3.3-1 1.7 1 3.3 1 1.7-1 3.4-1 1.6 1 3.3 1M2 22c1.7 0 1.7-1 3.3-1s1.7 1 3.4 1 1.6-1 3.3-1 1.7 1 3.3 1 1.7-1 3.4-1 1.6 1 3.3 1M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8M8 13h8"/>'),
  key: S('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>'),
  pin: S('<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>'),
  spark: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
  tag: S('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  chat: S('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>'),
  cal: S('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
  home: S('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  door: S('<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M15 12h.01"/>'),
  users: S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
  shield: S('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>'),
  alarm: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
  extinguisher: S('<path d="M10 8h4v13h-4zM12 8V5M12 5h4l2-2M9 5h3"/>'),
  wifi: S('<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>'),
  tv: S('<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>'),
  snow: S('<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>'),
  flame: S('<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7Z"/>'),
  fridge: S('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M8 6v1M8 13v3"/>'),
  microwave: S('<rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18 9v.01M18 12v.01"/>'),
  shower: S('<path d="M4 21V7a4 4 0 0 1 8 0M8 11h8M10 15v.01M14 15v.01M12 18v.01M16 18v.01M8 18v.01"/>'),
  car: S('<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3h-3M6 19H3M7 13h.01M17 13h.01"/>'),
  drop: S('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>'),
  leaf: S('<path d="M5 21c0-9 5-15 15-16-1 10-7 15-15 16ZM5 21l8-8"/>'),
  bed: S('<path d="M3 18V6M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11h.01"/>'),
  towel: S('<path d="M6 3h12v15H6zM6 18v3h12v-3M10 7h4"/>'),
  gift: S('<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4 9 8 12 8Zm0 0s2-5 4.5-4S15 8 12 8Z"/>'),
  closet: S('<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M12 2v20M10 11v2M14 11v2"/>'),
  kid: S('<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M8 11h8M9 22l3-7 3 7"/>'),
  utensils: S('<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-3 5-3 8h3v12"/>'),
  phone: S('<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>'),
  sms: S('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>'),
  mail: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>',
  ms: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.4 2 2 6.1 2 11.7c0 2.9 1.2 5.5 3.2 7.2V22l3-1.6c.9.2 1.8.4 2.8.4 5.6 0 10-4.1 10-9.7S17.6 2 12 2Zm1 13-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7L13 15Z"/></svg>',
  viber: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.9 2 3 5 3 10.5c0 3 1.1 5.1 3 6.4V21l3.1-2.4c1 .2 1.9.3 2.9.3 5.1 0 9-3 9-8.4S17.1 2 12 2Zm3.9 12.3c-.4.6-1.2 1.1-1.8 1-.9-.1-3-1-4.6-2.6-1.5-1.5-2.4-3.5-2.6-4.4-.1-.7.4-1.4 1-1.8.4-.2.8 0 1 .3l.9 1.4c.2.3.1.7-.2 1l-.4.4c.4 1.1 1.4 2.2 2.6 2.7l.4-.4c.3-.3.7-.4 1-.2l1.4.9c.3.2.5.6.3 1Z"/></svg>',
  fb: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8Z"/></svg>',
  ig: S('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>', 'stroke-width="2"'),
};
