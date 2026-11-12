// Home page. A short company page in the spirit of the clients' references: one full-width photo
// with a search, a few lines about the company, the properties as photo tiles, three doors
// (find a home / residents / owners), one guest quote, a short about, and one closing line.
// Everything below comes from data/site.json.
import { loadData, $, esc, pic, demoBar, footer, topbar, modesOf, buildingOf } from "./common.js";
import { visible, photoPicker, buildings, buildingTiles, aboutParagraphs } from "./tiles.js";
import { enhanceSelects } from "./select.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const shown = visible(site);
const c = site.contact || {};
const rt = (c.responseTime || "").replace(/^Responds /i, "");
const take = photoPicker(shown);

for (const [id, key] of [["home-headline", "headline"], ["home-intro", "intro"]]) {
  if (site.home?.[key]) $("#" + id).textContent = site.home[key].replace(/\*/g, "");
}

// Header sits on the photo until the page scrolls.
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("solid", scrollY > 40 || document.body.classList.contains("nav-open"));
addEventListener("scroll", onScroll, { passive: true });
document.querySelector(".nav-toggle")?.addEventListener("click", () => setTimeout(onScroll));
onScroll();

// ---------- opening ----------
const hero = take(/living/i, /garden|patio/i);
if (hero) $("#hero-media").innerHTML = pic(hero.src, hero.alt || hero.p.name, { sizes: "100vw", lazy: false });
const list = buildings(site, shown);
$("#v7-bldg").insertAdjacentHTML("beforeend", list.map((b) => `<option>${esc(b.name)}</option>`).join(""));
// A choice with only one answer isn't a choice: hide "Where" until there's more than one property.
if (list.length < 2) { $("#v7-bldg").closest("label").remove(); $("#v7-search").classList.add("two"); }
const modes = new Set(shown.flatMap(modesOf));
for (const o of [...$("#v7-search").mode.options]) if (modes.size && !modes.has(o.value)) o.remove();
enhanceSelects($("#v7-search"));
$("#v7-search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
  location.href = `units.html${q.size ? `?${q}` : ""}`;
});

// ---------- statement ----------
const promises = (site.home?.promises || []).filter((x) => x.title);
$("#promises").innerHTML = (promises.length ? promises.map((x) => [esc(x.title), esc(x.text || "")]) : [
  ["Ready on day one", "Cleaned and checked before every move-in."],
  ["One number", c.phone ? `${esc(c.phone)} for everything${rt ? `. Usually answered ${esc(rt)}` : ""}.` : "Viewings, repairs and questions all go to us."],
  ["Repairs, handled", "Tell us what's broken. We send someone."],
]).map(([h, p]) => `<li><b>${h}</b><span>${p}</span></li>`).join("");

// ---------- properties ----------
$("#bldg-tiles").innerHTML = buildingTiles(site, list);
$("#bldg-tiles").classList.toggle("odd", list.length % 2 === 1);
const usedTile = new Set(list.map((b) => b.photo?.src));

// ---------- three doors ----------
const pick = (...res) => { let x; do { x = take(...res); } while (x && usedTile.has(x.src)); return x; };
const doors = [
  { k: "Find your home", h: "Find a home", p: "Furnished and ready. Rent by the month or stay a few nights.", href: "units.html", cta: "See availability", ph: pick(/bedroom/i, /living/i) },
  { k: "Residents", h: "Live in one of ours", p: "Report a repair, ask about rent or plan your move-out.", href: "tenants.html", cta: "Get help", ph: pick(/kitchen/i, /bath/i) },
  { k: "Owners", h: "Own a unit", p: "We find the tenant, collect the rent and keep the place in shape.", href: "owners.html", cta: "How it works", ph: pick(/garden|patio/i, /gym/i) },
];
$("#doors").innerHTML = doors.map((d) => `<a class="v7-door" href="${d.href}">
    ${d.ph ? pic(d.ph.src, "", { sizes: "(max-width:900px) 100vw, 33vw" }) : ""}
    <span class="v7-door-text"><small>${d.k}</small><b>${d.h}</b><span>${d.p}</span><em>${d.cta}</em></span>
  </a>`).join("");

// ---------- one guest quote ----------
const rated = shown.filter((p) => p.rating?.count);
const own = rated[0];
const reviews = rated.flatMap((p) => (p.rating.reviews || []).map((rv) => ({ ...rv, p })));
const big = [...reviews].sort((a, b) => (b.stars || 0) - (a.stars || 0) || b.text.length - a.text.length).find((rv) => rv.text.length > 80) || reviews[0];
if (big) {
  const total = rated.reduce((n, p) => n + p.rating.count, 0);
  const src = [...new Set(rated.map((p) => p.rating.source).filter(Boolean))].join(" and ");
  $("#pull").innerHTML = `<blockquote>${esc(big.text)}</blockquote>
    <figcaption><b>${esc(big.name)}</b> · stayed at ${esc(buildingOf(big.p))}${big.date ? `, ${esc(big.date)}` : ""}</figcaption>
    ${own ? `<p class="v7-rating">Rated ${own.rating.value} out of 5 from ${total} reviews${src ? ` on ${esc(src)}` : ""} · <a href="property.html?id=${encodeURIComponent(big.p.id)}#reviews">Read them</a></p>` : ""}`;
} else $("#reviews").remove();

// ---------- about ----------
const aboutPh = pick(/touch|detail/i, /bedroom/i);
if (aboutPh) $("#about-photo").innerHTML = pic(aboutPh.src, aboutPh.alt || "", { sizes: "(max-width:900px) 100vw, 45vw" });
else $("#about-photo").remove();
$("#about-text").innerHTML = aboutParagraphs(site, shown).slice(0, 2).map((t) => `<p>${t}</p>`).join("");

// ---------- closing band ----------
if (c.phone) { $("#band-call").href = `tel:${c.phone.replace(/\s/g, "")}`; $("#band-call").textContent = `Call ${c.phone}`; }
else $("#band-call").remove();
