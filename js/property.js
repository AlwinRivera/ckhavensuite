import {
  loadData, $, $$, esc, money, plural, pic, demoBar, footer, channelList, openChannel, toast, track, icons, amenityIcon, starsHTML,
  bookedNights, rangeIsFree, monthHTML, todayISO, nightsBetween, pretty, addDays,
} from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
footer(site);

const params = new URLSearchParams(location.search);
const p = site.properties.find((x) => x.id === params.get("id")) || site.properties[0];
const host = site.host || {};
const booked = bookedNights(avail, p.id);
const today = todayISO();
const photos = p.tour.flatMap((r) => r.photos.map((ph) => ({ ...ph, room: r.room })));
const airbnbUrl = p.channels?.airbnb?.url;
// Promos and rates only become promises once the owner sets "confirmed": true in site.json.
const earlyBird = p.promos?.earlyBird?.confirmed ? p.promos.earlyBird : null;
const firm = () => !!p.stayTypes[state.type].confirmed;
// Only claim a synced calendar for platforms whose iCal link is set (or in demo mode, where dates are samples).
const syncedWith = Object.entries(p.channels || {}).filter(([, c]) => c.ical || (site.demo && c.url)).map(([k]) => ({ airbnb: "Airbnb", booking: "Booking.com" })[k] || k).join(" & ");
const hostFirst = () => host.name.split(" ")[0];
const parking = p.addons?.parking;
const long = { month: "short", day: "numeric", year: "numeric" };
document.title = p.title.includes(site.brand) ? p.title : `${p.title} | ${site.brand}`;
const secbar = Object.assign(document.createElement("nav"), { className: "secbar" });
secbar.setAttribute("aria-label", "Sections");
document.body.append(secbar);

// ---------------- state ----------------
const state = {
  type: p.stayTypes[params.get("type")] ? params.get("type") : "nightly",
  in: null, out: null,
  guests: Math.min(Math.max(Number(params.get("guests")) || 2, 1), p.guests),
  parking: false,
  view: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
};
{
  const qIn = params.get("in"), qOut = params.get("out");
  if (qIn && qOut && qIn >= today && qOut > qIn && rangeIsFree(booked, qIn, qOut) && nightsBetween(qIn, qOut) >= p.stayTypes[state.type].minNights) {
    Object.assign(state, { in: qIn, out: qOut, view: new Date(+qIn.slice(0, 4), +qIn.slice(5, 7) - 1, 1) });
  } else if (qIn && qOut) {
    setTimeout(() => {
      const first = firstStart();
      if (first) { jumpTo(first); render(); }
      toast(first ? `Those dates aren't available. Earliest ${state.type === "monthly" ? "monthly " : ""}opening: ${pretty(first, long)}.` : "Those dates aren't available.");
    }, 300);
  }
}

// ---------------- page ----------------
const r = p.rating;
// Laurel branch: a curved stem with pointed leaves, big on the outside, small on the inside.
const leaf = (x, y, a, s = 1) => `<path d="M0 0C-2.6-2.2-2.6-7 0-9.5C2.6-7 2.6-2.2 0 0Z" transform="translate(${x} ${y}) rotate(${a}) scale(${s})"/>`;
const laurel = `<svg class="laurel" viewBox="0 0 20 40" fill="currentColor" aria-hidden="true"><path d="M14 39C8 32 6.5 20 8.2 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>${
  [[13, 35, -58, 40], [10.6, 28, -50, 34], [9.1, 21, -42, 28], [8.4, 14, -32, 22]].map(([x, y, a, b]) => leaf(x, y, a) + leaf(x, y, b, 0.75)).join("")
}${leaf(8.2, 6, -10)}</svg>`;
const laurels = (inner) => `<div class="laurels">${laurel}${inner}${laurel.replace("class=\"laurel\"", "class=\"laurel flip\"")}</div>`;

$("#main").innerHTML = `
  <div class="m-hero">
    <div class="m-track" id="m-track">${photos.map((ph, i) => `<button type="button" data-photo="${i}" aria-label="Photo ${i + 1} of ${photos.length}: ${esc(ph.alt)}">${pic(ph.src, ph.alt, { sizes: "100vw", lazy: i > 0, cls: i ? "" : "vt-hero" })}</button>`).join("")}</div>
    <a class="m-fab m-back" href="index.html" aria-label="Back to all stays">${icons.chevL}</a>
    <div class="m-fabs"><button type="button" class="m-fab" data-share aria-label="Share">${icons.share}</button><button type="button" class="m-fab" data-save aria-label="Save">${icons.heart}</button></div>
    <span class="m-count" id="m-count" aria-hidden="true">1 / ${photos.length}</span>
  </div>

  <div class="listing-head" id="top">
    <h1>${esc(p.title)}</h1>
    <div class="row head-actions">
      <button class="icon-btn" data-share>${icons.share} Share</button>
      <button class="icon-btn" data-save>${icons.heart} <span>Save</span></button>
    </div>
  </div>

  <div class="gallery">
    ${photos.slice(0, 5).map((ph, i) => `<button type="button" data-photo="${i}" aria-label="Open photo: ${esc(ph.alt)}">${pic(ph.src, ph.alt, { sizes: i ? "25vw" : "50vw", lazy: i > 0, cls: i ? "" : "vt-hero" })}</button>`).join("")}
    <button type="button" class="all" data-tour>${icons.grid} Show all photos</button>
  </div>

  <div class="prop-layout">
    <article>
      <section class="block overview">
        <h2>${esc(p.kind)} in ${esc(p.city)}</h2>
        <div class="muted">${plural(p.guests, "guest")} · ${plural(p.bedrooms, "bedroom")} · ${plural(p.beds, "bed")} · ${plural(p.baths, "bath")}${p.size ? ` · ${esc(p.size)}` : ""}</div>
        </section>
      ${r ? `<a class="rating-card" href="#reviews">${laurels(`<b>${r.value}</b>`)}<div class="rc-text"><b>Loved by guests</b><span>Rated ${r.value} out of 5 by ${r.count} guests on ${esc(r.source)}</span></div><div class="rc-num"><b>${r.count}</b><span>Reviews</span></div></a>` : ""}

      <section class="block host-mini">
        <div class="avatar">${host.photo ? `<img src="${esc(host.photo)}" alt="">` : esc(host.initial)}<span class="verified">${icons.check}</span></div>
        <div><b>Hosted by ${esc(host.name)}</b><div class="muted small">${host.yearsHosting} years hosting · ${esc(site.contact.responseTime)}</div></div>
      </section>

      <section class="block highlights">
        ${p.highlights.map((h) => `<div class="hl">${icons[h.icon] || icons.check}<div><b>${esc(h.title)}</b><span>${esc(h.text)}</span></div></div>`).join("")}
      </section>

      ${earlyBird ? `<section class="block"><div class="promo-pill">${icons.tag}<div><b>Book early, save ${earlyBird.percent}%</b><div class="muted small">${esc(earlyBird.label)}. Applied automatically to short stays.</div></div></div></section>` : ""}

      <section class="block">
        <div class="desc" id="desc">${p.description.map((d) => `<p>${esc(d)}</p>`).join("")}</div>
        <button class="u" id="desc-more">Show more ›</button>
      </section>

      <section class="block">
        <h2>Where you'll sleep</h2>
        <div class="sleep">${p.sleeping.map((s) => `<figure>${pic(s.photo, s.room, { sizes: "300px" })}<b>${esc(s.room)}</b><span class="muted small">${esc(s.beds)}</span></figure>`).join("")}</div>
      </section>

      <section class="block" id="amenities">
        <h2>What this place offers</h2>
        <ul class="amenities">${p.topAmenities.map((a) => `<li>${amenityIcon(a)}<span>${esc(a)}</span></li>`).join("")}</ul>
        <button class="btn btn-ghost" id="amen-open">Show all ${p.amenities.filter((g) => !g.missing).reduce((n, g) => n + g.items.length, 0)} amenities</button>
      </section>

      <section class="block" id="calendar">
        <h2 id="cal-title"></h2>
        <div class="muted small" id="cal-sub" style="margin-bottom:24px"></div>
        <div class="cal-wrap" data-cal="inline"></div>
        <div class="cal-foot"><span class="muted xs">${syncedWith ? `Synced hourly with ${syncedWith}` : `${esc(host.name.split(" ")[0])} confirms availability in chat`}</span><button class="u" data-clear>Clear dates</button></div>
      </section>

    </article>

    <aside>
      <div class="book" id="book"></div>
      <div class="side-note">${icons.tag}<div><b>Book direct and save.</b> <span class="muted">No platform service fee, and you chat with the host directly.</span></div></div>
    </aside>
  </div>

  ${p.videos?.length ? `<section class="block" id="videos" style="border-top:1px solid var(--line)">
        <h2>Video walkthrough</h2>
        <div class="videos">${p.videos.map((v) => `<figure style="margin:0"><video src="${esc(v.src)}" poster="${esc(v.poster)}" controls playsinline preload="none"></video><figcaption class="small muted" style="margin-top:6px">${esc(v.title)} · ${esc(v.length)}</figcaption></figure>`).join("")}</div>
        ${p.rawVideos?.length ? `<p class="small muted" style="margin:12px 0 0">Prefer it unedited? Watch the original phone videos: ${p.rawVideos.map((v) => `<a class="u" href="${esc(v.src)}" target="_blank" rel="noopener">${esc(v.title)} (${esc(v.length)})</a>`).join(" · ")}</p>` : ""}
      </section>` : ""}

  ${r ? `<section class="block" id="reviews" style="border-top:1px solid var(--line)">
    <div class="rating-hero">${laurels(`<b>${r.value}</b>`)}<h2>Loved by guests</h2><p class="muted">Rated ${r.value} out of 5 by ${r.count} guests on ${esc(r.source)}.</p></div>
    <div class="cats">${Object.entries(r.categories).map(([k, v]) => `<div class="cat"><small>${esc(k)}</small><b>${v.toFixed(1)}</b><div class="bar"><i style="width:${(v / 5) * 100}%"></i></div></div>`).join("")}</div>
    <div class="reviews">${r.reviews.map((rv) => `
      <article class="review">
        <header><div class="avatar">${esc(rv.name[0])}</div><div><b>${esc(rv.name)}</b><div class="muted xs">${esc(rv.date)} · via ${esc(r.source)}</div></div></header>
        ${starsHTML(rv.stars)}
        <p>${esc(rv.text)}</p>
      </article>`).join("")}</div>
    ${airbnbUrl ? `<a class="btn btn-ghost" style="margin-top:32px" href="${esc(airbnbUrl)}#reviews" target="_blank" rel="noopener">Show all ${r.count} reviews on ${esc(r.source)}</a>` : ""}
  </section>` : ""}

  <section class="block" id="location">
    <h2>Where you'll be</h2>
    <div>${esc(p.building)}, ${esc(p.address || p.area)}</div>
    <div class="map" id="map" role="region" aria-label="Map showing ${esc(p.building)}"><div class="map-fallback muted small">Loading map…</div></div>
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-soft btn-sm" href="${esc(p.map.google)}" target="_blank" rel="noopener">${icons.pin} Open in Google Maps</a>
      <a class="btn btn-soft btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${p.map.lat},${p.map.lon}" target="_blank" rel="noopener" data-track="directions">${icons.car} Directions</a>
    </div>
    <p class="muted small">The pin marks the ${esc(p.building)} complex. Your unit number and lockbox code are shared after your booking is confirmed.</p>
    <p>${esc(p.neighborhood)}</p>
  </section>

  <section class="block" id="host">
    <h2>Meet your host</h2>
    <div class="host-wrap">
      <div class="host-card">
        <div class="who">
          <div class="avatar lg">${host.photo ? `<img src="${esc(host.photo)}" alt="">` : esc(host.initial)}<span class="verified">${icons.check}</span></div>
          <b>${esc(host.name.split(" ")[0])}</b><span class="small">Host</span>
        </div>
        <div class="host-stats">
          ${r ? `<div><b>${r.count}</b><small>Reviews</small></div><div><b>${r.value}${icons.star}</b><small>Rating</small></div>` : ""}
          <div><b>${host.yearsHosting}</b><small>Years hosting</small></div>
        </div>
      </div>
      <div>
        <p>${esc(host.bio)}</p>
        ${host.cohosts?.length ? `<h3 style="margin-top:20px">Co-hosts</h3><p class="muted">${host.cohosts.map(esc).join(", ")}</p>` : ""}
        <h3>Host details</h3>
        <p class="muted">Response rate: ${esc(host.responseRate)}<br>${esc(site.contact.responseTime)}<br>Speaks ${host.languages.map(esc).join(" and ")}</p>
        <button class="btn btn-dark" data-message-host>Message host</button>
      </div>
    </div>
  </section>

  ${p.faq?.length ? `<section class="block" id="faq">
    <h2>Questions guests ask</h2>
    <div class="faq">${p.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
    <p class="muted small" style="margin:16px 0 0">Something else? <button class="u" data-message-host>Message ${esc(host.name.split(" ")[0])}</button></p>
  </section>` : ""}

  <section class="block">
    <h2>Things to know</h2>
    <div class="know">
      <div><h3>House rules</h3><ul>
        <li>${icons.clock}<span>Check-in: ${esc(p.rules.checkIn)}</span></li>
        <li>${icons.clock}<span>Checkout: ${esc(p.rules.checkOut)}</span></li>
        <li>${icons.users}<span>${p.rules.maxGuests} guests maximum</span></li>
      </ul><button class="u know-more" data-rules>Show more ›</button></div>
      <div><h3>Safety & property</h3><ul>
        ${p.amenities.filter((g) => g.group === "Home safety").flatMap((g) => g.items).map((a) => `<li>${amenityIcon(a)}${esc(a)}</li>`).join("")}
        ${p.amenities.filter((g) => g.missing).flatMap((g) => g.items).filter((a) => /alarm|detector|extinguisher|first aid/i.test(a)).map((a) => `<li>${amenityIcon(a)}<span>No ${esc(a.toLowerCase())}</span></li>`).join("")}
        <li>${icons.shield}24/7 building security</li>
      </ul></div>
      <div><h3>Cancellation policy</h3><ul>
        <li>${icons.cal}<span>${esc(p.rules.cancellation)}</span></li>
        ${earlyBird ? `<li>${icons.tag}<span>${esc(earlyBird.label)}.</span></li>` : ""}
      </ul></div>
    </div>
  </section>`;

$("#main").removeAttribute("aria-busy");

// ---------------- pricing ----------------
function estimate() {
  if (!state.in || !state.out) return null;
  const n = nightsBetween(state.in, state.out);
  const st = p.stayTypes[state.type];
  const lines = [];
  let total;
  if (state.type === "monthly") {
    const months = n / 30;
    total = st.price * months;
    lines.push([`${money(site, st.price)} × ${months.toFixed(months % 1 ? 1 : 0)} month${months > 1 ? "s" : ""}`, total]);
  } else {
    total = st.price * n;
    lines.push([`${money(site, st.price)} × ${plural(n, "night")}`, total]);
    if (earlyBird && nightsBetween(today, state.in) >= earlyBird.daysAhead) {
      const d = Math.round(total * earlyBird.percent / 100);
      lines.push([`Early-bird discount (${earlyBird.percent}%)`, -d, "disc"]);
      total -= d;
    }
  }
  if (state.parking && parking) {
    lines.push([`Parking × ${plural(n, "night")}`, parking.price * n]);
    total += parking.price * n;
  }
  lines.push(["Platform service fee", 0, "disc"]);
  return { n, lines, total };
}
const earlyActive = () => state.type === "nightly" && earlyBird && state.in && nightsBetween(today, state.in) >= earlyBird.daysAhead;

// ---------------- calendar ----------------
const selectingOut = () => state.in && !state.out;
const minNights = () => p.stayTypes[state.type].minNights;
/** A night can be a check-in only if the minimum stay that follows it is entirely free. */
const canStart = (d) => d >= today && rangeIsFree(booked, d, addDays(d, minNights()));
const validCheckout = (d) => !!state.in && d > state.in && nightsBetween(state.in, d) >= minNights() && rangeIsFree(booked, state.in, d);
function firstStart() {
  for (let i = 0, d = today; i < 400; i++, d = addDays(d, 1)) if (canStart(d)) return d;
  return null;
}
function dayClass(d) {
  const past = d < today;
  const isBooked = booked.has(d);
  const cls = [];
  let disabled, title = "";
  if (selectingOut() && d > state.in) {
    // Choosing checkout: only dates that satisfy the minimum stay with no booked nights in between.
    disabled = !validCheckout(d);
    if (disabled) {
      if (!rangeIsFree(booked, state.in, d)) { cls.push("booked"); title = "Unavailable"; }
      else { cls.push("nomin"); title = `${plural(minNights(), "night")} minimum`; }
    }
  } else {
    // Choosing check-in (or tapping before the current check-in to restart).
    disabled = past || !canStart(d);
    if (isBooked) { cls.push("booked"); title = "Unavailable"; }
    else if (!past && disabled) { cls.push("nomin"); title = `Not enough free nights for a ${plural(minNights(), "night")} stay`; }
  }
  if (past) cls.push("past");
  if (d === today) cls.push("today");
  if (d === state.in) { cls.push("sel", "start"); disabled = false; }
  if (d === state.out) { cls.push("sel", "end"); disabled = false; }
  if (state.in && state.out && d > state.in && d < state.out) cls.push("in-range");
  if (state.in && !state.out && d === state.in) cls.push("end");
  return { cls: cls.join(" "), disabled, title };
}
/** Make sure the month holding the earliest valid checkout is visible after picking a check-in. */
function revealCheckout() {
  const target = addDays(state.in, minNights());
  const months = twoMonths.matches ? 2 : 1;
  const t = new Date(+target.slice(0, 4), +target.slice(5, 7) - 1, 1);
  const last = new Date(state.view.getFullYear(), state.view.getMonth() + months - 1, 1);
  if (t > last) state.view = new Date(t.getFullYear(), t.getMonth() - months + 1, 1);
}
function calHint() {
  const est = estimate();
  if (est) return `${pretty(state.in, long)} – ${pretty(state.out, long)}`;
  const min = minNights();
  if (selectingOut()) return `Check-in ${pretty(state.in, long)} · pick a checkout at least ${plural(min, "night")} later`;
  const first = firstStart();
  if (!first) return `No ${min}-night openings in the next year. Message the host for options.`;
  if (min > 1) return `Minimum ${plural(min, "night")} · earliest opening <b>${pretty(first, long)}</b> <button class="u" data-jump="${first}">Show me</button>`;
  return `Add your travel dates for exact pricing`;
}
function jumpTo(d) { state.view = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, 1); }
const twoMonths = matchMedia("(min-width: 600px)");
function calHTML() {
  const v = state.view, now = new Date();
  const months = twoMonths.matches ? 2 : 1;
  let html = "";
  for (let i = 0; i < months; i++) { const m = new Date(v.getFullYear(), v.getMonth() + i, 1); html += monthHTML(m.getFullYear(), m.getMonth(), dayClass); }
  const atStart = v.getFullYear() === now.getFullYear() && v.getMonth() === now.getMonth();
  const atEnd = (v.getFullYear() - now.getFullYear()) * 12 + v.getMonth() - now.getMonth() >= 11;
  return `<div class="cal-nav"><button type="button" data-nav="-1" ${atStart ? "disabled" : ""} aria-label="Previous month">‹</button><button type="button" data-nav="1" ${atEnd ? "disabled" : ""} aria-label="Next month">›</button></div>
    <div class="cal-months ${months === 2 ? "two" : ""}">${html}</div>`;
}

function pickDay(d) {
  const min = minNights();
  if (!state.in || state.out || d <= state.in) {
    if (d === state.in && !state.out) { state.in = null; return render(); } // tap check-in again to unselect
    if (!canStart(d)) return toast(booked.has(d) ? "That night is already booked." : `There aren't ${min} free nights starting that day.`);
    state.in = d; state.out = null;
    revealCheckout();
  } else if (!rangeIsFree(booked, state.in, d)) {
    return toast("Some nights in that range are booked. Try a shorter stay.");
  } else if (nightsBetween(state.in, d) < min) {
    return toast(`${state.type === "monthly" ? "Monthly rentals" : "Stays"} need at least ${plural(min, "night")}.`);
  } else {
    state.out = d;
    track("dates-selected");
    if (!$("#pop")?.hidden && $("#pop")) setTimeout(() => ($("#pop").hidden = true), 250);
  }
  render();
}

document.addEventListener("click", (e) => {
  const day = e.target.closest(".day");
  if (day && !day.disabled && day.closest("[data-cal]")) return pickDay(day.dataset.date);
  const nav = e.target.closest("[data-nav]");
  if (nav) { state.view = new Date(state.view.getFullYear(), state.view.getMonth() + Number(nav.dataset.nav), 1); return renderCals(); }
  if (e.target.closest("[data-clear]")) { state.in = state.out = null; return render(); }
  const jump = e.target.closest("[data-jump]");
  if (jump) { jumpTo(jump.dataset.jump); return render(); }
});

// ---------------- booking card ----------------
function renderBook() {
  const st = p.stayTypes[state.type];
  const unit = state.type === "monthly" ? "month" : "night";
  const est = estimate();
  const ready = !!est;
  const priceHTML = est
    ? `${firm() ? "" : "<small>About</small> "}${money(site, est.total)} <span>for ${plural(est.n, "night")}</span>`
    : earlyActive()
    ? `<s>${money(site, st.price)}</s>${money(site, st.price * (1 - earlyBird.percent / 100))} <span>${unit}</span>`
    : `${money(site, st.price)} <span>${unit}</span>`;
  const rateNote = firm() ? "" : `<p class="rate-note">Estimated rate. ${esc(hostFirst())} confirms the final price in chat before you pay anything.</p>`;
  const types = Object.keys(p.stayTypes);
  $("#book").innerHTML = `
    ${types.length > 1 ? `<div class="toggle" role="group" aria-label="Stay type">${types.map((t) => `<button type="button" data-type="${t}" aria-pressed="${t === state.type}">${t === "monthly" ? "Monthly rental" : "Short stay"}</button>`).join("")}</div>` : ""}
    <div class="book-price">${firm() || est ? "" : "<small>From</small> "}${priceHTML}</div>${rateNote}
    <div class="book-box">
      <div class="book-dates">
        <button type="button" data-open-pop="in" class="${!state.in ? "active" : ""}"><small>Check-in</small><span class="${state.in ? "set" : ""}">${state.in ? pretty(state.in, { month: "numeric", day: "numeric", year: "numeric" }) : "Add date"}</span></button>
        <button type="button" data-open-pop="out" class="${state.in && !state.out ? "active" : ""}"><small>Checkout</small><span class="${state.out ? "set" : ""}">${state.out ? pretty(state.out, { month: "numeric", day: "numeric", year: "numeric" }) : "Add date"}</span></button>
      </div>
      <div class="book-guests">
        <div><small>Guests</small><span class="small">${plural(state.guests, "guest")}</span></div>
        <div class="stepper"><button type="button" data-guests="-1" ${state.guests <= 1 ? "disabled" : ""} aria-label="Fewer guests">−</button><button type="button" data-guests="1" ${state.guests >= p.guests ? "disabled" : ""} aria-label="More guests">+</button></div>
      </div>
    </div>
    <div class="pop" id="pop" hidden>
      <h3 style="margin:0">${ready ? plural(est.n, "night") : selectingOut() ? "Select checkout date" : "Select check-in date"}</h3>
      <div class="muted small" style="margin-bottom:20px">${calHint()}</div>
      <div class="cal-wrap" data-cal="pop"></div>
      <div class="pop-foot"><button class="u" data-clear>Clear dates</button><button class="btn btn-dark btn-sm" data-close-pop>Close</button></div>
    </div>
    ${ready && parking ? `<label class="addon"><span>Add ${esc(parking.label.toLowerCase())} <span class="muted">(${money(site, parking.price)}/${parking.per})</span></span><input type="checkbox" id="parking" ${state.parking ? "checked" : ""}></label>` : ""}
    <button class="btn btn-primary btn-block btn-lg" id="reserve">${ready ? "Request to book" : "Check availability"}</button>
    ${ready ? `<p class="charge-note">You won't be charged yet</p>
      <div class="estimate">${est.lines.map(([l, v, c]) => `<div class="${c || ""}"><span class="${c ? "" : "u"}" style="font-weight:400">${esc(l)}</span><span>${v < 0 ? "−" : ""}${money(site, Math.abs(v))}</span></div>`).join("")}
      <div class="total"><span>${firm() ? "Total" : "Estimated total"}</span><span>${money(site, est.total)}</span></div></div>` : ""}
    ${airbnbUrl ? `<div class="alt-book muted">Prefer Airbnb? <a class="u" href="${esc(airbnbUrl)}" target="_blank" rel="noopener" data-ota="airbnb">Book there ↗</a></div>` : ""}
    ${p.channels?.booking?.url ? `<div class="alt-book muted" style="margin-top:4px">Or on <a class="u" href="${esc(p.channels.booking.url)}" target="_blank" rel="noopener" data-ota="booking">Booking.com ↗</a></div>` : ""}
    ${syncedWith ? `<div class="sync"><span class="dot"></span>Live calendar · synced hourly with ${syncedWith}</div>` : ""}`;
}

$("#book").addEventListener("click", (e) => {
  const t = e.target.closest("[data-type]");
  if (t) {
    state.type = t.dataset.type;
    if (state.in && !canStart(state.in)) {
      state.in = state.out = null;
      const first = firstStart();
      if (first) jumpTo(first);
      toast(`Those dates don't fit a ${plural(minNights(), "night")} stay. We moved the calendar to the earliest opening.`);
    } else if (state.in && state.out && !validCheckout(state.out)) {
      state.out = null;
      revealCheckout();
    }
    return render();
  }
  const g = e.target.closest("[data-guests]");
  if (g) { state.guests = Math.min(Math.max(state.guests + Number(g.dataset.guests), 1), p.guests); return render(); }
  if (e.target.closest("[data-open-pop]")) return openDates();
  if (e.target.closest("[data-close-pop]")) return ($("#pop").hidden = true);
  if (e.target.closest("#reserve")) return estimate() ? openRequest() : openDates();
  const ota = e.target.closest("[data-ota]");
  if (ota) track(`ota-${ota.dataset.ota}`);
});
$("#book").addEventListener("change", (e) => { if (e.target.id === "parking") { state.parking = e.target.checked; render(); } });
document.addEventListener("click", (e) => {
  const pop = $("#pop");
  if (!e.target.isConnected) return; // clicked node was re-rendered (calendar nav/day)
  if (pop && !pop.hidden && !e.target.closest("#pop") && !e.target.closest("[data-open-pop]") && !e.target.closest(".day")) pop.hidden = true;
});

const sheetMode = matchMedia("(max-width: 960px)");
function openDates() {
  if (sheetMode.matches) return openSheet();
  $("#pop").hidden = false;
  renderCals();
}

// ---------------- request sheet ----------------
function requestMessage() {
  const est = estimate();
  if (!est) return `Hi ${hostFirst()}! I have a question about ${p.name}.`;
  return [
    `Hi ${hostFirst()}! I'd like to book ${p.name} (${state.type === "monthly" ? "monthly rental" : "short stay"}).`,
    `Check-in: ${pretty(state.in, { weekday: "short", ...long })}`,
    `Checkout: ${pretty(state.out, { weekday: "short", ...long })}`,
    `${plural(est.n, "night")} · ${plural(state.guests, "guest")}${state.parking ? " · with parking" : ""}`,
    firm()
      ? `Total: ${money(site, est.total)}${earlyActive() ? ` (incl. ${earlyBird.percent}% early-bird)` : ""}
Is it available?`
      : `Is it available, and what would the total be?`,
  ].join("\n");
}
function openRequest(general = false) {
  const est = general ? null : estimate();
  const msg = general ? `Hi ${host.name.split(" ")[0]}! I have a question about ${p.name}.` : requestMessage();
  $("#req-title").textContent = est ? "Request to book" : "Message the host";
  $("#req-body").innerHTML = `
    ${est ? `<div class="req-summary">${pic(p.cover, p.name, { sizes: "112px" })}<div><b>${esc(p.title)}</b><div class="muted small">${pretty(state.in, long)} – ${pretty(state.out, long)} · ${plural(state.guests, "guest")}</div><div style="margin-top:6px">${firm() ? "" : "<span class=\"muted small\">about</span> "}<b>${money(site, est.total)}</b> <span class="muted small">${firm() ? "total" : "estimated total"}</span></div></div></div>` : ""}
    <h3>${est ? "Send your request" : "Pick how to reach us"}</h3>
    <p class="muted small" style="margin:0">${est ? `${esc(hostFirst())} confirms availability${firm() ? "" : " and the final price"}, then sends GCash or bank details for the deposit. Nothing is charged until you agree.` : esc(site.contact.responseTime) + "."}</p>
    <div class="req-msg" aria-label="Message preview">${esc(msg)}</div>
    <div class="channels-grid">${channelList(site, msg).map((c) => `<button class="ch-btn" data-ch="${c.key}"><i style="background:${c.color}">${c.icon}</i><span>${esc(c.label)}<small>${esc(c.sub || "")}</small></span></button>`).join("")}</div>`;
  $("#req-body").onclick = (e) => {
    const b = e.target.closest("[data-ch]");
    if (b) openChannel(channelList(site, msg).find((c) => c.key === b.dataset.ch), msg);
  };
  $("#request").showModal();
  track(est ? "request-open" : "message-host");
}
$$("[data-message-host]").forEach((b) => b.addEventListener("click", () => openRequest(true)));

// ---------------- mobile bar ----------------
function renderMbar() {
  const st = p.stayTypes[state.type];
  const est = estimate();
  $("#mbar").innerHTML = `
    <div>
      <div class="p">${est ? money(site, est.total) : money(site, st.price)} <span>${est ? (firm() ? "total" : "est. total") : state.type === "monthly" ? "month" : "night"}</span></div>
      <button class="d" data-mdates>${est ? `${pretty(state.in)} – ${pretty(state.out)}` : "Add dates"}</button>
    </div>
    <button class="btn btn-primary" data-mreserve>${est ? "Reserve" : "Check availability"}</button>`;
}
$("#mbar").addEventListener("click", (e) => {
  if (e.target.closest("[data-mdates]")) return openSheet();
  if (e.target.closest("[data-mreserve]")) return estimate() ? openRequest() : openSheet();
});

// ---------------- render ----------------
function renderCals() { $$("[data-cal]").forEach((el) => (el.innerHTML = el.dataset.cal === "sheet" ? sheetCalHTML() : calHTML())); }

// ---------------- dates sheet (phones): months scroll vertically, like a native app ----------------
function sheetCalHTML() {
  const now = new Date();
  let html = "";
  for (let i = 0; i < 12; i++) { const m = new Date(now.getFullYear(), now.getMonth() + i, 1); html += monthHTML(m.getFullYear(), m.getMonth(), dayClass); }
  return `<div class="cal-months">${html}</div>`;
}
const sheet = $("#dates");
function renderSheet() {
  const est = estimate();
  $("#ds-title").textContent = est ? plural(est.n, "night") : selectingOut() ? "Select checkout date" : "Select check-in date";
  $("#ds-sub").innerHTML = calHint().replace(/<button[^>]*data-jump[^>]*>.*?<\/button>/, ""); // the sheet scrolls to the opening itself
  $("#ds-total").innerHTML = est ? `<b>${firm() ? "" : "About "}${money(site, est.total)}</b><span class="muted xs">${firm() ? "total" : "estimated total"}</span>` : "";
  $("#ds-done").textContent = est ? "Save dates" : "Close";
}
function scrollSheetTo(d) {
  const m = d && sheet.querySelector(`[data-month="${d.slice(0, 7)}"]`);
  if (m) sheet.querySelector(".ds-body").scrollTop = m.offsetTop - 8;
}
function openSheet() {
  renderCals(); renderSheet();
  sheet.showModal();
  scrollSheetTo(state.in || firstStart());
  track("dates-sheet");
}
$("#ds-done").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) sheet.close();
  if (e.target.closest("[data-clear]")) setTimeout(() => scrollSheetTo(firstStart()), 0);
});
function render() {
  const est = estimate();
  $("#cal-title").textContent = est ? `${plural(est.n, "night")} in Cagayan de Oro` : selectingOut() ? "Select checkout date" : "Select check-in date";
  $("#cal-sub").innerHTML = calHint();
  const popOpen = $("#pop") && !$("#pop").hidden;
  renderBook();
  if (popOpen && !(state.in && state.out)) $("#pop").hidden = false;
  renderCals();
  renderMbar();
  renderSheet();
  renderSecbar();
  const q = new URLSearchParams({ id: p.id, type: state.type, guests: state.guests });
  if (state.in && state.out) { q.set("in", state.in); q.set("out", state.out); }
  history.replaceState(null, "", `?${q}`);
}
twoMonths.addEventListener("change", renderCals);
render();

// ---------------- description / amenities ----------------
$("#desc-more").addEventListener("click", (e) => {
  const open = $("#desc").classList.toggle("open");
  e.target.textContent = open ? "Show less ‹" : "Show more ›";
});
$("#amen-body").innerHTML = p.amenities.map((g) => `<h3 style="margin-top:8px">${esc(g.group)}</h3><ul class="amen-list">${g.items.map((a) => `<li class="${g.missing ? "missing" : ""}">${amenityIcon(a)}<span>${esc(a)}</span></li>`).join("")}</ul>`).join("");
$("#amen-open").addEventListener("click", () => $("#amen").showModal());

// House rules sheet, grouped like Airbnb's: checking in and out, during your stay, before you leave.
const ruleIcon = (r) => /^no |not the bedroom/i.test(r) ? icons.x : /quiet|until|checkout/i.test(r) ? icons.clock : /guest/i.test(r) ? icons.users : /pool/i.test(r) ? icons.pool : /lock/i.test(r) ? icons.door : icons.check;
const ruleList = (items) => `<ul class="amen-list">${items.map((r) => `<li>${ruleIcon(r)}<span>${esc(r)}</span></li>`).join("")}</ul>`;
const ru = p.rules;
$("#rules-body").innerHTML = `
  <p class="muted" style="margin-top:0">You’ll be staying in someone’s home, so please treat it with care and respect.</p>
  <h3>Checking in and out</h3>
  ${ruleList([`Check-in: ${ru.checkIn}`, `Checkout: ${ru.checkOut}`, ru.selfCheckIn, ru.lateCheckout].filter(Boolean))}
  <h3>During your stay</h3>
  ${ruleList([`${ru.maxGuests} guests maximum`, ...(ru.list || [])])}
  ${ru.beforeCheckout?.length ? `<h3>Before you leave</h3>${ruleList(ru.beforeCheckout)}` : ""}`;
document.querySelector("[data-rules]")?.addEventListener("click", () => $("#rules").showModal());

// ---------------- share / save ----------------
$$("[data-share]").forEach((b) => b.addEventListener("click", async () => {
  const data = { title: p.title, text: `${p.title}, rated ${r?.value} on ${r?.source}`, url: location.href };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); toast("Link copied. Share it with your travel buddies!"); } track("share"); } catch {}
}));
const saveKey = `ckhaven:saved:${p.id}`;
const getSaved = () => { try { return localStorage.getItem(saveKey) === "1"; } catch { return false; } };
function paintSave() {
  const on = getSaved();
  $$("[data-save]").forEach((b) => { b.classList.toggle("saved", on); b.setAttribute("aria-pressed", on); const t = b.querySelector("span"); if (t) t.textContent = on ? "Saved" : "Save"; });
}
$$("[data-save]").forEach((b) => b.addEventListener("click", () => {
  try { localStorage.setItem(saveKey, getSaved() ? "0" : "1"); } catch {}
  paintSave();
  if (getSaved()) { b.classList.remove("popping"); void b.offsetWidth; b.classList.add("popping"); }
  toast(getSaved() ? "Saved to this device." : "Removed from saved.");
}));
paintSave();

// ---------------- photo tour + lightbox ----------------
$("#tour-body").innerHTML = `
  <nav class="ptour-nav" aria-label="Rooms">${p.tour.map((room, i) => `<a href="#room-${i}">${pic(room.photos[0].src, room.room, { sizes: "120px" })}${esc(room.room)}</a>`).join("")}</nav>
  ${p.tour.map((room, i) => `
    <section class="ptour-room" id="room-${i}">
      <div><h3>${esc(room.room)}</h3><p class="muted small">${esc(room.note)}</p></div>
      <div class="ptour-grid">${room.photos.map((ph) => `<button type="button" data-photo="${photos.findIndex((x) => x.src === ph.src)}" aria-label="Open photo: ${esc(ph.alt)}">${pic(ph.src, ph.alt, { sizes: "(max-width:700px) 50vw, 300px" })}</button>`).join("")}</div>
    </section>`).join("")}`;

const lb = $("#lightbox");
let idx = 0;
function show(i) {
  idx = (i + photos.length) % photos.length;
  const img = lb.querySelector(".lb-stage img");
  img.src = photos[idx].src; img.alt = photos[idx].alt;
  $("#lb-count").textContent = `${idx + 1} / ${photos.length}`;
  $("#lb-room").textContent = photos[idx].room;
  $("#lb-cap").textContent = photos[idx].alt;
  new Image().src = photos[(idx + 1) % photos.length].src; // warm the next photo
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-tour]")) { $("#tour").showModal(); track("photo-tour"); return; }
  const ph = e.target.closest("[data-photo]");
  if (ph) {
    if (ph.closest(".gallery") && !matchMedia("(max-width:760px)").matches) { $("#tour").showModal(); return; }
    show(Number(ph.dataset.photo)); lb.showModal(); return;
  }
  const c = e.target.closest("[data-close]");
  if (c) c.closest("dialog").close();
});
lb.addEventListener("click", (e) => {
  const a = e.target.closest("[data-lb]")?.dataset.lb;
  if (a === "prev") show(idx - 1); else if (a === "next") show(idx + 1); else if (a === "close") lb.close();
});
document.addEventListener("keydown", (e) => {
  if (!lb.open) return;
  if (e.key === "ArrowLeft") show(idx - 1);
  if (e.key === "ArrowRight") show(idx + 1);
});
let touchX = null;
lb.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
lb.addEventListener("touchend", (e) => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); touchX = null; });
$$("dialog.sheet").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
$$(".x[data-close]").forEach((b) => { if (!b.textContent.trim()) b.innerHTML = icons.x; });

// ---------------- mobile photo carousel ----------------
const track_ = $("#m-track");
track_.addEventListener("scroll", () => {
  $("#m-count").textContent = `${Math.round(track_.scrollLeft / track_.clientWidth) + 1} / ${photos.length}`;
}, { passive: true });

// ---------------- desktop section bar ----------------
function renderSecbar() {
  const est = estimate();
  const st = p.stayTypes[state.type];
  secbar.innerHTML = `<div class="wrap"><div class="secbar-links"><a href="#top">Photos</a><a href="#amenities">Amenities</a>${r ? "<a href=\"#reviews\">Reviews</a>" : ""}<a href="#location">Location</a></div>
    <div class="secbar-cta"><div><b>${est ? money(site, est.total) : money(site, st.price)}</b> <span class="muted small">${est ? (firm() ? "total" : "est. total") : state.type === "monthly" ? "month" : "night"}</span>${r ? `<div class="xs">${icons.star} ${r.value} · <span class="muted">${r.count} reviews</span></div>` : ""}</div><button class="btn btn-primary" data-secbar-reserve>${est ? "Request to book" : "Check availability"}</button></div></div>`;
}
const seen = { gallery: true, book: true };
const secIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => (seen[e.target.dataset.watch] = e.isIntersecting));
  secbar.classList.toggle("on", !seen.gallery);
  secbar.classList.toggle("cta", !seen.book);
}, { rootMargin: "-72px 0px 0px 0px" });
$(".gallery").dataset.watch = "gallery"; secIO.observe($(".gallery"));
$("#book").dataset.watch = "book"; secIO.observe($("#book"));
secbar.addEventListener("click", (e) => {
  if (!e.target.closest("[data-secbar-reserve]")) return;
  if (estimate()) return openRequest();
  $("#book").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(openDates, 400);
});

// ---------------- map (Leaflet + OpenStreetMap, free, lazy-loaded) ----------------
const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${LEAFLET}leaflet.min.css` });
  document.head.append(css);
  return new Promise((ok, fail) => {
    const s = Object.assign(document.createElement("script"), { src: `${LEAFLET}leaflet.min.js`, onload: () => ok(window.L), onerror: fail });
    document.head.append(s);
  });
}
async function initMap() {
  const el = $("#map");
  try {
    const L = await loadLeaflet();
    el.innerHTML = "";
    const map = L.map(el, {
      center: [p.map.lat, p.map.lon],
      zoom: p.map.zoom || 16,
      scrollWheelZoom: false, // mouse wheel scrolls the page, not the map; +/- buttons zoom
      dragging: true,
      tap: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const pin = L.divIcon({ className: "map-pin", html: `<span>${icons.home}</span>`, iconSize: [48, 48], iconAnchor: [24, 24] });
    L.marker([p.map.lat, p.map.lon], { icon: pin, title: p.building, keyboard: false })
      .addTo(map)
      .bindPopup(`<b>${esc(p.building)}</b><br>${esc(p.address || p.area)}<br><a href="${esc(p.map.google)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`);
    // Re-centre button so a lost guest can always get back to the pin.
    const Recenter = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const b = L.DomUtil.create("button", "map-recenter");
        b.type = "button"; b.title = "Back to CK Haven"; b.setAttribute("aria-label", "Back to CK Haven");
        b.innerHTML = icons.home;
        L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); map.setView([p.map.lat, p.map.lon], p.map.zoom || 16, { animate: false }); });
        return b;
      },
    });
    map.addControl(new Recenter());
  } catch {
    el.innerHTML = `<a class="map-fallback" href="${esc(p.map.google)}" target="_blank" rel="noopener">${icons.pin} View ${esc(p.building)} on Google Maps</a>`;
  }
}
let mapStarted = false;
const startMap = () => { if (mapStarted) return; mapStarted = true; mapIO.disconnect(); initMap(); };
const mapIO = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) startMap(); }, { rootMargin: "400px" });
mapIO.observe($("#map"));
setTimeout(startMap, 4000); // backup: load anyway once the page has settled
document.addEventListener("click", (e) => { const t = e.target.closest("[data-track]"); if (t) track(t.dataset.track); });
