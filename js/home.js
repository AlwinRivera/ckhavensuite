import { loadData, $, $$, esc, money, plural, pic, demoBar, footer, channelList, openChannel, icons, toast, starsHTML, todayISO, addDays, bookedNights, nextFreeNight, pretty } from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
footer(site);

const live = site.properties.filter((p) => p.status === "live");
const first = live[0] || site.properties[0];
const r = first.rating;
const c = site.contact;
const host = site.host;
// Home page text is editable in the host admin; the HTML keeps a copy for search engines.
for (const [id, key] of [["home-headline", "headline"], ["home-intro", "intro"], ["loc-title", "locationTitle"], ["loc-text", "locationText"], ["contact-title", "contactTitle"], ["contact-text", "contactText"]]) {
  if (site.home?.[key]) $("#" + id).textContent = site.home[key];
}
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
  const cards = site.properties.filter((p) => p.status !== "hidden").map((p) => {
    const st = p.stayTypes[type];
    const free = nextFreeNight(bookedNights(avail, p.id));
    const synced = Object.values(p.channels || {}).some((c) => c.ical) || site.demo;
    const when = !synced ? "Message us for dates" : free === todayISO() ? "Available tonight" : `Available from ${pretty(free)}`;
    // Cover first, then one photo from each other room: swipeable like the Airbnb app.
    const shots = [{ src: p.cover, alt: p.name }, ...p.tour.map((r) => r.photos[0]).filter((ph) => ph.src !== p.cover)].slice(0, 6);
    return `
    <div class="lcard-wrap" data-unit="${esc(p.id)}">
      <a class="lcard" href="property.html?id=${encodeURIComponent(p.id)}&type=${st ? type : "nightly"}">
        <div class="lcard-media"><div class="lc-track">${shots.map((ph, i) => pic(ph.src, ph.alt, { sizes: "(max-width:640px) 100vw, 360px", lazy: i > 0, cls: i ? "" : "vt-hero" })).join("")}</div>${p.rating ? `<span class="lcard-badge">Loved by guests</span>` : ""}</div>
        <div class="lcard-body">
          <div class="lcard-top"><span>${esc(p.kind.replace("Entire ", "").replace(/^./, (m) => m.toUpperCase()))} in ${esc(p.area.split(",")[0].replace("Brgy. ", ""))}</span>${p.rating ? `<span class="rating-inline" style="font-weight:400">${icons.star} ${p.rating.value} (${p.rating.count})</span>` : ""}</div>
          <span class="muted">${esc(p.name)} · ${esc(p.building)}</span>
          <span class="muted">${plural(p.bedrooms, "bedroom")} · ${plural(p.beds, "bed")} · pool access</span>
          <span class="muted">${when}</span>
          <span class="price" style="margin-top:4px">${st ? `${st.confirmed ? "" : "From "}<b>${money(site, st.price)}</b> ${type === "monthly" ? "month" : "night"}` : `<span class="muted">Not offered as a ${type === "monthly" ? "monthly rental" : "short stay"}</span>`}</span>
        </div>
      </a>
      <div class="lc-over">
        <button type="button" class="lc-heart${isSaved(p.id) ? " saved" : ""}" data-heart aria-pressed="${isSaved(p.id)}" aria-label="Save ${esc(p.name)}">${icons.heart}</button>
        <button type="button" class="lc-arrow prev" data-step="-1" aria-label="Previous photo" hidden>${icons.chevL}</button>
        <button type="button" class="lc-arrow next" data-step="1" aria-label="Next photo">${icons.chevR}</button>
        <div class="lc-dots" aria-hidden="true">${shots.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>
      </div>
    </div>`;
  });
  if (site.showComingSoon) cards.push(`<div class="lcard soon"><div class="lcard-media"><div><div style="font-size:2rem;line-height:1">+</div><b style="color:var(--ink)">More havens coming</b><p class="small" style="margin:6px 0 0">New units get their own page, calendar and booking links automatically.</p></div></div></div>`);
  $("#units").innerHTML = cards.join("");
  $$(".lcard-wrap").forEach((w) => {
    const track = w.querySelector(".lc-track");
    const dots = [...w.querySelectorAll(".lc-dots i")];
    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, j) => d.classList.toggle("on", j === i));
      w.querySelector(".prev").hidden = i === 0;
      w.querySelector(".next").hidden = i === dots.length - 1;
    }, { passive: true });
  });
}
// Saved state is shared with the listing page's heart (same key).
const saveKey = (id) => `ckhaven:saved:${id}`;
function isSaved(id) { try { return localStorage.getItem(saveKey(id)) === "1"; } catch { return false; } }
$("#units").addEventListener("click", (e) => {
  const w = e.target.closest(".lcard-wrap");
  if (!w) return;
  const step = e.target.closest("[data-step]");
  if (step) {
    const track = w.querySelector(".lc-track");
    track.scrollBy({ left: track.clientWidth * Number(step.dataset.step), behavior: "smooth" });
    return;
  }
  const heart = e.target.closest("[data-heart]");
  if (heart) {
    const on = !isSaved(w.dataset.unit);
    try { localStorage.setItem(saveKey(w.dataset.unit), on ? "1" : "0"); } catch {}
    heart.classList.toggle("saved", on);
    heart.setAttribute("aria-pressed", on);
    heart.classList.remove("popping"); void heart.offsetWidth; if (on) heart.classList.add("popping");
    toast(on ? "Saved to this device." : "Removed from saved.");
  }
});
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

// Video mosaic: tiles open a full-screen player, like the photo viewer.
const vp = $("#vplayer");
const vpVideo = vp.querySelector("video");
if (matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelectorAll(".vtile video").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); });
document.querySelector(".vmosaic")?.addEventListener("click", (e) => {
  const t = e.target.closest("[data-play]");
  if (!t) return;
  $("#vp-title").textContent = t.dataset.title;
  vpVideo.src = t.dataset.play;
  vp.showModal();
  vpVideo.play().catch(() => {});
});
vp.addEventListener("click", (e) => { if (e.target.closest("[data-vp-close]") || e.target === vp) vp.close(); });
vp.addEventListener("close", () => { vpVideo.pause(); vpVideo.removeAttribute("src"); vpVideo.load(); });
