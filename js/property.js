// One unit we manage. Laid out like a management company's unit page rather than a booking site:
// photos, the facts, the terms (rent, short-stay rate), and "schedule a viewing" as the main action.
// Short stays link out to the unit's Airbnb / Booking.com pages, where dates and payment are handled.
// URL: property.html?id=<unit id>&mode=rent|stay (mode only decides which price is listed first).
import { loadData, $, esc, money, pic, demoBar, footer, topbar, modesOf, priceOf, categoryLabel, buildingOf, buildingHref, placeOf, availOf, availNote } from "./common.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const q = new URLSearchParams(location.search);
const shown = site.properties.filter((p) => p.status !== "hidden");
const p = shown.find((x) => x.id === q.get("id")) || shown[0];
const main = $("#main");
main.removeAttribute("aria-busy");

if (!p) {
  main.innerHTML = `<div class="wrap v7-sec"><h1 class="v7-h2">This home isn't available</h1><p class="v7-text">It may have been rented out. <a href="units.html">See what's available now</a>.</p></div>`;
} else render(p);

function render(p) {
  const c = site.contact || {};
  const tel = c.phone ? `tel:${c.phone.replace(/\s/g, "")}` : "";
  const rt = (c.responseTime || "").replace(/^Responds /i, "");
  const bldg = buildingOf(p);
  const w = placeOf(p);
  const order = ["rent", "stay", "sale"].filter((m) => modesOf(p).includes(m));
  const first = order.includes(q.get("mode")) ? q.get("mode") : order[0];
  const modes = [first, ...order.filter((m) => m !== first)].filter(Boolean);
  const title = p.title.includes(" · ") ? p.title.split(" · ").slice(1).join(" · ") : p.name;
  const specs = [categoryLabel(p), p.bedrooms ? `${p.bedrooms} bedroom${p.bedrooms > 1 ? "s" : ""}` : "", p.baths && `${p.baths} bath`, p.size, p.guests && `sleeps ${p.guests}`].filter(Boolean);
  // A rented unit keeps its page; the button asks to hear when it's free instead of booking a viewing.
  const av = availOf(p), note = availNote(p);
  const cta = av === "rented" ? "Ask when it's free" : "Schedule a viewing";
  const viewHref = `contact.html?about=${av === "rented" ? "looking" : "viewing"}&unit=${encodeURIComponent(p.id)}`;
  const askHref = `contact.html?about=looking&unit=${encodeURIComponent(p.id)}`;
  document.title = `${title} · ${bldg} · ${site.brand}`;

  // Photos: cover first, then every room's photos, no repeats.
  const seen = new Set();
  const photos = [{ src: p.cover, alt: p.name, room: "" }, ...(p.tour || []).flatMap((r) => r.photos.map((ph) => ({ ...ph, room: r.room })))]
    .filter((ph) => ph.src && !seen.has(ph.src) && seen.add(ph.src));

  // Terms per way of renting.
  const st = p.stayTypes || {};
  const terms = {
    rent: st.monthly && { label: "Monthly rent", price: st.monthly.price, per: "a month", notes: [st.monthly.minNights >= 30 && `Minimum ${Math.round(st.monthly.minNights / 30)} month${st.monthly.minNights >= 60 ? "s" : ""}`, st.monthly.note].filter(Boolean) },
    stay: st.nightly && { label: "Short stay", price: st.nightly.price, per: "a night", notes: [st.nightly.minNights > 1 ? `Minimum ${st.nightly.minNights} nights` : "From 1 night", p.rules?.maxGuests && `Up to ${p.rules.maxGuests} guests`].filter(Boolean) },
    sale: p.sale && { label: "For sale", price: p.sale.price, per: "", notes: [] },
  };
  const booking = [p.channels?.airbnb?.url && ["Airbnb", p.channels.airbnb.url], p.channels?.booking?.url && ["Booking.com", p.channels.booking.url]].filter(Boolean);

  const amen = (p.amenities || []).filter((g) => !g.missing && g.items?.length);
  const rv = p.rating?.count ? p.rating : null;
  const video = (p.videos || [])[0];
  const rules = p.rules || {};

  main.innerHTML = `
  <div class="wrap">
    <nav class="crumbs v7-crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><i>›</i><a href="units.html">Availability</a><i>›</i><a href="${buildingHref(bldg)}">${esc(bldg)}</a><i>›</i><span>${esc(title)}</span></nav>
    <header class="v7-prop-head">
      <p class="v7-over"><a href="${buildingHref(bldg)}">${esc(bldg)}</a>${p.area ? ` · ${esc(p.area)}` : ` · ${esc(w.city)}`}</p>
      <h1 class="v7-h2">${esc(title)}</h1>
      <p class="v7-prop-specs">${specs.map(esc).join(" · ")}</p>
    </header>

    <div class="v7-gallery${photos.length < 5 ? " few" : ""}">
      ${photos.slice(0, 5).map((ph, i) => `<button type="button" class="v7-g${i === 0 ? " main" : ""}" data-photo="${i}" aria-label="Open photo ${i + 1} of ${photos.length}">${pic(ph.src, ph.alt || p.name, { sizes: i === 0 ? "(max-width:900px) 100vw, 60vw" : "(max-width:900px) 50vw, 20vw", lazy: i > 0 })}</button>`).join("")}
      ${photos.length > 1 ? `<button type="button" class="v7-g-all" data-photo="0">All ${photos.length} photos</button>` : ""}
    </div>

    <div class="v7-prop-grid">
      <div class="v7-prop-body">
        <section class="v7-block">
          <h2>About this home</h2>
          ${p.summary ? `<p class="v7-prop-lede">${esc(p.summary)}</p>` : ""}
          ${(p.description || []).map((t) => `<p>${esc(t)}</p>`).join("")}
        </section>

        ${p.highlights?.length ? `<section class="v7-block"><h2>Highlights</h2><ul class="v7-ruled">${p.highlights.map((h) => `<li><b>${esc(h.title)}</b><span>${esc(h.text)}</span></li>`).join("")}</ul></section>` : ""}

        ${p.sleeping?.length ? `<section class="v7-block"><h2>Rooms</h2><div class="v7-rooms">${p.sleeping.map((s) => `<figure>${s.photo ? pic(s.photo, s.room, { sizes: "(max-width:900px) 50vw, 25vw" }) : ""}<figcaption><b>${esc(s.room)}</b><span>${esc(s.beds)}</span></figcaption></figure>`).join("")}</div></section>` : ""}

        ${video ? `<section class="v7-block"><h2>Video tour</h2><video class="v7-video" controls preload="none" playsinline ${video.poster ? `poster="${esc(video.poster)}"` : ""} src="${esc(video.src)}"></video>${(p.videos || []).length > 1 ? `<p class="v7-small">${p.videos.slice(1).map((v) => `<a href="${esc(v.src)}" target="_blank" rel="noopener">${esc(v.title)}${v.length ? ` (${esc(v.length)})` : ""}</a>`).join(" · ")}</p>` : ""}</section>` : ""}

        ${amen.length ? `<section class="v7-block"><h2>What's included</h2><div class="v7-amen">${amen.map((g) => `<div><h3>${esc(g.group)}</h3><ul>${g.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul></div>`).join("")}</div></section>` : ""}

        <section class="v7-block">
          <h2>The building</h2>
          ${p.neighborhood ? `<p>${esc(p.neighborhood)}</p>` : ""}
          <p class="v7-links"><a class="v7-more" href="${buildingHref(bldg)}">About ${esc(bldg)}</a>${p.map?.google ? `<a class="v7-more" href="${esc(p.map.google)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ""}</p>
        </section>

        ${modesOf(p).includes("stay") && (rules.list?.length || rules.checkIn) ? `<section class="v7-block"><h2>For short stays</h2>
          <dl class="v7-facts">${[["Check-in", rules.checkIn], ["Check-out", rules.checkOut], ["Arrival", rules.selfCheckIn]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          ${rules.list?.length ? `<ul class="v7-dots">${rules.list.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
          ${rules.cancellation ? `<p class="v7-small">${esc(rules.cancellation)}</p>` : ""}</section>` : ""}

        ${rv ? `<section class="v7-block" id="reviews"><h2>What guests say</h2>
          <p class="v7-score"><b>${rv.value}</b><span>out of 5 from ${rv.count} reviews${rv.source ? ` on ${esc(rv.source)}` : ""}</span></p>
          ${rv.categories ? `<dl class="v7-facts v7-cats">${Object.entries(rv.categories).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
          <div class="v7-reviews">${(rv.reviews || []).map((r) => `<figure><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b>${r.date ? ` · ${esc(r.date)}` : ""}</figcaption></figure>`).join("")}</div>
        </section>` : ""}

        ${p.faq?.length ? `<section class="v7-block"><h2>Questions</h2><div class="faq">${p.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>` : ""}
      </div>

      <aside class="v7-terms" aria-label="Rent and how to apply">
        ${note ? `<p class="v7-status v7-status-${av}">${esc(note)}${av === "rented" ? ": someone lives here now. Ask and we'll tell you when it opens up, or see what's free today." : ""}</p>` : ""}
        <ul class="v7-unit-prices">${modes.map((m) => terms[m] && `<li><span>${terms[m].label}${terms[m].notes.length ? `<small>${terms[m].notes.map(esc).join(" · ")}</small>` : ""}</span><b>${terms[m].price ? money(site, terms[m].price) : "On request"}</b>${terms[m].per ? `<em>${terms[m].per}</em>` : ""}</li>`).filter(Boolean).join("")}</ul>
        <a class="btn btn-primary btn-block btn-lg" href="${viewHref}">${cta}</a>
        <a class="btn btn-ghost btn-block" href="${askHref}">Ask a question</a>
        ${booking.length && modesOf(p).includes("stay") ? `<div class="v7-book"><p>Short stay? Check dates and book on</p><div>${booking.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div></div>` : ""}
        ${c.phone ? `<p class="v7-terms-call">Or call <a href="${tel}">${esc(c.phone)}</a>${rt ? `<br><span>Usually answered ${esc(rt)}</span>` : ""}</p>` : ""}
      </aside>
    </div>
  </div>

  <section class="v7-band">
    <div class="wrap narrow">
      <h2 class="v7-h2">Want to see it in person?</h2>
      <div class="v7-band-links"><a class="v7-more" href="${viewHref}">${cta}</a><a class="v7-more" href="units.html">See other homes</a></div>
    </div>
  </section>`;

  // Phone bar: price and the main action, always in reach.
  const mb = $("#mbar");
  const t0 = terms[modes[0]];
  mb.innerHTML = `<div><b>${t0?.price ? money(site, t0.price) : ""}</b>${t0?.per ? `<span> ${t0.per}</span>` : ""}</div><a class="btn btn-primary" href="${viewHref}">${cta}</a>`;
  mb.hidden = false;
  document.body.classList.add("v7-has-mbar");

  // All photos, grouped by room.
  const dlg = $("#photos");
  const rooms = [...new Set(photos.map((ph) => ph.room || "Overview"))];
  $("#photos-body").innerHTML = rooms.map((r) => `<section><h3>${esc(r)}</h3><div class="v7-photos-grid">${photos.map((ph, i) => [ph, i]).filter(([ph]) => (ph.room || "Overview") === r).map(([ph, i]) => `<figure id="ph-${i}">${pic(ph.src, ph.alt || "", { sizes: "(max-width:900px) 100vw, 50vw" })}${ph.alt && ph.room ? `<figcaption>${esc(ph.alt)}</figcaption>` : ""}</figure>`).join("")}</div></section>`).join("");
  main.addEventListener("click", (e) => {
    const b = e.target.closest("[data-photo]");
    if (!b) return;
    dlg.showModal();
    document.getElementById(`ph-${b.dataset.photo}`)?.scrollIntoView({ block: "start" });
  });
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === dlg) dlg.close(); });

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
