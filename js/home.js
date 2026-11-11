import { loadData, $, $$, esc, money, plural, pic, demoBar, footer, channelList, openChannel, icons, starsHTML, todayISO, addDays, bookedNights, nextFreeNight, pretty } from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
footer(site);

const live = site.properties.filter((p) => p.status === "live");
const first = live[0] || site.properties[0];
const r = first.rating;
const c = site.contact;
const host = site.host;
if (site.properties.some((p) => Object.values(p.channels || {}).some((ch) => ch.ical)))
  $("#stays-lead").textContent = "Live availability, synced with our Airbnb and Booking.com calendars, so what you see is really free.";

// Social proof + channels
if (r) $("#proof").innerHTML = `${icons.star} ${r.value} · ${r.count} reviews on ${esc(r.source)}`;
const airbnb = first.channels?.airbnb?.url;
$("#channels").innerHTML = `
  <span>Find us on</span>
  ${airbnb ? `<a class="chip" href="${esc(airbnb)}" target="_blank" rel="noopener"><span class="dot" style="background:var(--airbnb)"></span>Airbnb</a>` : ""}
  ${first.channels?.booking?.url ? `<a class="chip" href="${esc(first.channels.booking.url)}" target="_blank" rel="noopener"><span class="dot" style="background:var(--booking)"></span>Booking.com</a>` : ""}
  ${c.facebook ? `<a class="chip" href="${esc(c.facebook)}" target="_blank" rel="noopener"><span class="dot" style="background:#0866ff"></span>Facebook</a>` : ""}
  ${c.instagram ? `<a class="chip" href="${esc(c.instagram)}" target="_blank" rel="noopener"><span class="dot" style="background:#d62976"></span>Instagram</a>` : ""}
  <span class="chip"><span class="dot" style="background:var(--direct)"></span>or book direct for the best rate</span>`;

// Listing cards
let type = "nightly";
function renderUnits() {
  const cards = site.properties.map((p) => {
    const st = p.stayTypes[type];
    const free = nextFreeNight(bookedNights(avail, p.id));
    const synced = Object.values(p.channels || {}).some((c) => c.ical) || site.demo;
    const when = !synced ? "Message us for dates" : free === todayISO() ? "Available tonight" : `Available from ${pretty(free)}`;
    return `
      <a class="lcard" href="property.html?id=${encodeURIComponent(p.id)}&type=${st ? type : "nightly"}">
        <div class="lcard-media">${pic(p.cover, p.name, { sizes: "(max-width:640px) 100vw, 360px" })}${p.rating ? `<span class="lcard-badge">Loved by guests</span>` : ""}</div>
        <div class="lcard-body">
          <div class="lcard-top"><span>${esc(p.kind.replace("Entire ", "").replace(/^./, (m) => m.toUpperCase()))} in ${esc(p.area.split(",")[0].replace("Brgy. ", ""))}</span>${p.rating ? `<span class="rating-inline" style="font-weight:400">${icons.star} ${p.rating.value} (${p.rating.count})</span>` : ""}</div>
          <span class="muted">${esc(p.name)} · ${esc(p.building)}</span>
          <span class="muted">${plural(p.bedrooms, "bedroom")} · ${plural(p.beds, "bed")} · pool access</span>
          <span class="muted">${when}</span>
          <span class="price" style="margin-top:4px">${st ? `${st.confirmed ? "" : "From "}<b>${money(site, st.price)}</b> ${type === "monthly" ? "month" : "night"}` : `<span class="muted">Not offered as a ${type === "monthly" ? "monthly rental" : "short stay"}</span>`}</span>
        </div>
      </a>`;
  });
  if (site.showComingSoon) cards.push(`<div class="lcard soon"><div class="lcard-media"><div><div style="font-size:2rem;line-height:1">+</div><b style="color:var(--ink)">More havens coming</b><p class="small" style="margin:6px 0 0">New units get their own page, calendar and booking links automatically.</p></div></div></div>`);
  $("#units").innerHTML = cards.join("");
}
$$(".toggle button").forEach((b) => b.addEventListener("click", () => {
  type = b.dataset.type;
  $$(".toggle button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderUnits();
}));
renderUnits();

// Search -> listing page
const form = $("#search");
const tIn = form.elements.in, tOut = form.elements.out;
tIn.min = todayISO();
tIn.value = addDays(todayISO(), 7);
tOut.value = addDays(tIn.value, 2);
tOut.min = addDays(tIn.value, 1);
tIn.addEventListener("change", () => {
  tOut.min = addDays(tIn.value, 1);
  if (tOut.value <= tIn.value) tOut.value = addDays(tIn.value, form.elements.type.value === "monthly" ? 30 : 2);
});
form.elements.type.addEventListener("change", () => { if (form.elements.type.value === "monthly") tOut.value = addDays(tIn.value, 30); });
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = new URLSearchParams({ id: first.id, in: tIn.value, out: tOut.value, guests: form.elements.guests.value, type: form.elements.type.value });
  location.href = `property.html?${q}`;
});

// Location highlights
$("#loc-hl").innerHTML = [
  [icons.pool, "Heated outdoor pool", "Shared, open year-round."],
  [icons.leaf, "Your own garden patio", "Table, chairs and an umbrella under the trees."],
  [icons.shield, "24/7 security", "Gated complex with round-the-clock guards."],
  [icons.car, "Parking available", "Secure parking for ₱300/night."],
].map(([ic, t, s]) => `<div class="hl">${ic}<div><b>${t}</b><span>${s}</span></div></div>`).join("");

// Reviews
if (r) {
  $("#rev-title").innerHTML = `${icons.star.replace('class="star"', 'class="star" style="width:28px;height:28px;vertical-align:-3px"')} ${r.value} from ${r.count} guests`;
  $("#rev-list").innerHTML = r.reviews.slice(0, 3).map((rv) => `
    <article class="review">
      <header><div class="avatar">${esc(rv.name[0])}</div><div><b>${esc(rv.name)}</b><div class="muted xs">${esc(rv.date)} · via ${esc(r.source)}</div></div></header>
      ${starsHTML(rv.stars)}
      <p style="font-size:1.05rem">${esc(rv.text)}</p>
    </article>`).join("");
  if (airbnb) $("#rev-all").href = `${airbnb}#reviews`; else $("#rev-all").remove();
}

// Perks
const eb = first.promos?.earlyBird?.confirmed ? first.promos.earlyBird : null;
$("#perks").innerHTML = [
  [icons.tag, "No platform fees", "Skip the service fees that booking platforms add on top of the nightly rate."],
  eb && [icons.cal, `${eb.percent}% early-bird`, `Book ${eb.daysAhead}+ days before check-in and we take ${eb.percent}% off automatically.`],
  [icons.chat, "Talk to the host", `Chat with ${esc(host.name.split(" ")[0])} directly on Messenger, WhatsApp or Viber before you commit.`],
  [icons.home, "Monthly rates", `Staying 30+ nights? The monthly rate starts at ${money(site, first.stayTypes.monthly?.price || 0)}.`],
].filter(Boolean).map(([ic, h, p]) => `<div class="perk"><div class="perk-ic">${ic}</div><h3>${h}</h3><p>${p}</p></div>`).join("");

// Host + contact
$("#host-mini").innerHTML = `<div class="avatar">${host.photo ? `<img src="${esc(host.photo)}" alt="">` : esc(host.initial)}<span class="verified">${icons.check}</span></div><div><b>Hosted by ${esc(host.name)}</b><div class="muted small">${host.yearsHosting} years hosting · ${esc(c.responseTime)} · ${esc(host.responseRate)} response rate</div></div>`;
const msg = `Hi ${site.brand}! I'd like to ask about a stay at ${first.name}.`;
const chans = channelList(site, msg);
$("#contact-row").innerHTML = chans.map((ch) => `<button class="ch-btn" data-ch="${ch.key}"><i style="background:${ch.color}">${ch.icon}</i><span>${esc(ch.label)}<small>${esc(ch.sub || "")}</small></span></button>`).join("");
$("#contact-row").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ch]");
  if (b) openChannel(chans.find((x) => x.key === b.dataset.ch), msg);
});
