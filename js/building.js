// One building, subdivision or apartment block: every unit listed there, with photos, building
// features, the neighbourhood and the map. Built entirely from the listings in site.json, so a
// building gets a page as soon as one listing names it.
import {
  loadData, $, esc, money, pic, demoBar, footer, topbar, icons, amenityIcon, listingCard, wireCards, channelList, openChannel,
  MODES, modesOf, placeOf, priceOf, categoryLabel, bigMoney, petsOf, PETS_LABEL, loadLeaflet, OSM_TILES, buildingOf, buildingInfo, availOf,
} from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const shown = site.properties.filter((p) => p.status !== "hidden");
const name = (new URLSearchParams(location.search).get("name") || "").trim();
const ps = shown.filter((p) => buildingOf(p) === name);
// The building record from Admin → Properties: its own photo, description, amenities and map.
const info = buildingInfo(site, name);
const main = $("#main");

if (!name || !ps.length) {
  document.title = `Building not found · ${site.brand}`;
  main.innerHTML = `<section class="b-missing">
    <h1>We couldn't find that building</h1>
    <p class="muted">It may have no units listed right now, or the link is old.</p>
    <div class="row"><a class="btn btn-primary" href="properties.html">See our properties</a><a class="btn btn-ghost" href="units.html">Available units</a></div>
  </section>`;
} else {
  render();
}

function render() {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const w = placeOf(ps[0]);
  const area = info?.area || ps.find((p) => p.area)?.area || "";
  const open = ps.filter((p) => availOf(p) !== "rented");
  const address = ps.find((p) => p.address)?.address || [area, w.city].filter(Boolean).join(", ");
  const geo = info?.map?.lat ? info.map : ps.find((p) => p.map?.lat)?.map;
  const gmaps = info?.map?.google || (geo ? geo.google || `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}` : "");
  const types = [...new Set(ps.map(categoryLabel))];
  const modes = Object.keys(MODES).filter((m) => open.some((p) => modesOf(p).includes(m)));
  const isBuilding = !!ps[0].building;
  const kind = types.length === 1 ? `${types[0]} ${/house|lot/i.test(types[0]) ? "community" : "building"}` : "Building";

  document.title = `${name} · ${w.city} · ${site.brand}`;
  $('meta[name="description"]').content = `${plural(ps.length, "unit", "units")} listed at ${name}, ${[area.split(",")[0], w.city].filter(Boolean).join(", ")}: ${modes.map((m) => MODES[m].label.toLowerCase()).join(", ")} on ${site.brand}.`;

  // Price summary per way of listing: "1 unit for rent · from ₱23,000/mo".
  const lines = modes.map((m) => {
    const inM = open.filter((p) => modesOf(p).includes(m));
    const lo = Math.min(...inM.map((p) => priceOf(p, m)).filter(Boolean));
    const what = m === "rent" ? "for rent" : m === "stay" ? "for short stays" : "for sale";
    const from = Number.isFinite(lo) ? `from ${m === "sale" ? bigMoney(site, lo) : money(site, lo)}${m === "rent" ? " / month" : m === "stay" ? " / night" : ""}` : "price on request";
    return { m, n: inM.length, what, from };
  });

  // Photos of the shared spaces first (pool, gym, lobby…), then each unit's cover.
  const shared = /pool|gym|amenit|lobby|exterior|facade|building|common|clubhouse|grounds/i;
  const photos = [];
  const add = (ph) => { if (ph?.src && !photos.some((x) => x.src === ph.src)) photos.push(ph); };
  if (info?.photo) add({ src: info.photo, alt: name });
  for (const p of ps) for (const room of p.tour || []) if (shared.test(room.room || "")) room.photos.forEach(add);
  (info?.photos || []).forEach(add); // extra building photos chosen in Admin → Properties
  for (const p of ps) add({ src: p.cover, alt: p.name });
  for (const p of ps) for (const room of p.tour || []) add(room.photos[0]);
  const gal = photos.slice(0, 5);

  // Shared features listed on the units (their "Building" amenity groups), merged.
  const feats = info?.amenities?.length ? info.amenities : [...new Set(ps.flatMap((p) => (p.amenities || []).filter((g) => !g.missing && /building|shared|community|complex/i.test(g.group)).flatMap((g) => g.items)))]
    .filter((a) => !/long stays?|nights?\)? welcome|minimum stay/i.test(a)); // stay rules belong to the unit, not the building
  const hood = info?.neighborhood || ps.find((p) => p.neighborhood)?.neighborhood || "";
  const pets = [...new Set(ps.map(petsOf))];
  const petsText = pets.length === 1 ? PETS_LABEL[pets[0]] : "Varies by unit";

  const facts = [
    [icons.home, "Type", types.join(", ")],
    [icons.key, "Units we manage", `${ps.length}${open.length < ps.length ? ` · ${open.length} open` : ""}`],
    [icons.pin, "Area", area.split(",")[0] || w.city],
    [icons.leaf, "Pets in listed units", petsText],
  ];

  main.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><i>›</i><a href="properties.html">Our properties</a><i>›</i><span>${esc(name)}</span></nav>

    <div class="listing-head b-head">
      <div>
        <div class="pc-kicker">${esc(isBuilding ? kind : categoryLabel(ps[0]))} · ${esc(w.city)}</div>
        <h1>${esc(name)}</h1>
        <div class="lh-meta"><span>${icons.pin}${esc(address)}</span>${gmaps ? `<a href="${esc(gmaps)}" target="_blank" rel="noopener"><span class="u">Directions ↗</span></a>` : ""}</div>
      </div>
      <div class="lh-right">
        <div class="row head-actions">
          <button class="btn btn-primary" id="b-ask">${icons.chat} Ask about units here</button>
        </div>
      </div>
    </div>

    ${gal.length >= 5 ? `<div class="gallery b-gallery">${gal.map((ph, i) => `<div>${pic(ph.src, ph.alt || name, { sizes: i ? "25vw" : "50vw", lazy: i > 0 })}</div>`).join("")}</div>`
      : gal.length ? `<div class="b-cover">${pic(gal[0].src, gal[0].alt || name, { sizes: "100vw", lazy: false })}</div>` : ""}

    ${info?.description?.length ? `<div class="b-desc">${info.description.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : ""}

    <div class="b-facts">${facts.map(([ic, b, s]) => `<div>${ic}<span><small>${esc(b)}</small><b>${esc(s)}</b></span></div>`).join("")}</div>

    <section class="b-sec" id="units">
      <div class="b-sec-head">
        <h2>Units at ${esc(name)}</h2>
        <ul class="b-sum">${lines.map((l) => `<li><a href="#u-${l.m}"><b>${plural(l.n, "unit", "units")}</b> ${l.what} · ${esc(l.from)}</a></li>`).join("")}</ul>
      </div>
      ${open.length ? "" : `<p class="muted">Every unit we manage here is rented right now. <a class="u" href="contact.html?about=looking">Ask us</a> and we'll tell you when one opens up.</p>`}
      ${lines.map((l) => `<div class="b-mode" id="u-${l.m}">
        ${lines.length > 1 ? `<h3>${esc(MODES[l.m].label)} <span class="muted">(${l.n})</span></h3>` : ""}
        <div class="lgrid">${open.filter((p) => modesOf(p).includes(l.m)).map((p) => listingCard(site, avail, p, { mode: l.m })).join("")}</div>
      </div>`).join("")}
    </section>

    ${feats.length ? `<section class="b-sec" id="features">
      <h2>Building features</h2>
      <p class="muted">Shared by everyone in the building. Fees and hours are set by the building and can change.</p>
      <ul class="amenities b-feats">${feats.map((a) => `<li>${amenityIcon(a)}<span>${esc(a)}</span></li>`).join("")}</ul>
    </section>` : ""}

    <section class="b-sec" id="location">
      <h2>Location</h2>
      ${hood ? `<p class="b-hood">${esc(hood)}</p>` : ""}
      <p class="muted">${esc(address)}</p>
      ${geo ? `<div class="map" id="map" role="region" aria-label="Map showing ${esc(name)}"><div class="map-fallback muted small">Loading map…</div></div>` : ""}
    </section>

    <section class="b-sec b-cta">
      <div>
        <h2>Own a unit at ${esc(name)}?</h2>
        <p class="muted">We can manage it for you: tenants or guests, rent, cleaning and repairs. It would show up on this page with the other units.</p>
      </div>
      <a class="btn btn-primary" href="contact.html?about=owner${isBuilding ? `&building=${encodeURIComponent(name)}` : ""}">Talk to us about it</a>
    </section>`;

  wireCards(main);

  $("#b-ask").addEventListener("click", () => {
    const msg = `Hi ${(site.host?.name || "").split(" ")[0] || "there"}! I'm interested in a unit at ${name}, ${w.city}.\n\nLooking for: ${lines.map((l) => l.what.replace("for ", "")).join(" / ")}\nMove-in or dates: `;
    const chans = channelList(site, msg, `Units at ${name}`);
    openChannel(chans.find((x) => x.key === "whatsapp") || chans.find((x) => x.key === "messenger") || chans[0], msg);
  });

  // Structured data so search engines read the page as a residence complex with its address.
  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": isBuilding ? "ApartmentComplex" : "Residence", name,
    address: { "@type": "PostalAddress", streetAddress: address, addressLocality: w.city, addressCountry: "PH" },
    ...(geo ? { geo: { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lon } } : {}),
    ...(petsText === PETS_LABEL.yes ? { petsAllowed: true } : petsText === PETS_LABEL.no ? { petsAllowed: false } : {}),
  });
  document.head.append(ld);

  if (geo) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); initMap(geo, address, gmaps); } }, { rootMargin: "300px" });
    io.observe($("#map"));
  }
}

async function initMap(geo, address, gmaps) {
  const el = $("#map");
  try {
    const L = await loadLeaflet();
    el.innerHTML = "";
    const map = L.map(el, { center: [geo.lat, geo.lon], zoom: geo.zoom || 16, scrollWheelZoom: false, tap: false });
    L.tileLayer(...OSM_TILES).addTo(map);
    const pin = L.divIcon({ className: "map-pin", html: `<span>${icons.home}</span>`, iconSize: [48, 48], iconAnchor: [24, 24] });
    L.marker([geo.lat, geo.lon], { icon: pin, title: name, keyboard: false }).addTo(map)
      .bindPopup(`<b>${esc(name)}</b><br>${esc(address)}<br><a href="${esc(gmaps)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`);
  } catch {
    el.innerHTML = `<a class="map-fallback" href="${esc(gmaps)}" target="_blank" rel="noopener">${icons.pin} View ${esc(name)} on Google Maps</a>`;
  }
}
