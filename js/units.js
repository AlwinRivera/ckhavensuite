// Availability: every unit we manage that's open, one card each, with every way it can be rented.
// Filters: ?mode=rent|stay|sale, ?building=<name>, ?beds=<n> (the home page search sends these).
import { loadData, $, esc, money, pic, demoBar, footer, topbar, modesOf, priceOf, categoryLabel, bigMoney, buildingOf, buildingHref, availOf, availNote } from "./common.js";
import { visible } from "./tiles.js";
import { enhanceSelects } from "./select.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

// Rented units keep their own page but leave the list of what's open.
const shown = visible(site).filter((p) => availOf(p) !== "rented");
const MODE = { rent: ["Monthly rent", "a month"], stay: ["Short stay", "a night"], sale: ["For sale", ""] };
const form = $("#filter");
const modes = ["rent", "stay", "sale"].filter((m) => shown.some((p) => modesOf(p).includes(m)));
$("#f-mode").insertAdjacentHTML("beforeend", modes.map((m) => `<option value="${m}">${MODE[m][0]}</option>`).join(""));
$("#f-bldg").insertAdjacentHTML("beforeend", [...new Set(shown.map(buildingOf))].sort().map((b) => `<option>${esc(b)}</option>`).join(""));
if (new Set(shown.map(buildingOf)).size < 2) $("#f-bldg").closest("label").remove();

const q = new URLSearchParams(location.search);
for (const k of ["mode", "building", "beds"]) {
  const el = form.elements[k];
  if (!el) continue;
  if (q.get(k) && [...el.options].some((o) => (o.value || o.textContent) === q.get(k))) el.value = q.get(k);
}

const price = (p, m) => {
  const v = priceOf(p, m);
  if (!v) return `<li><span>${MODE[m][0]}</span><b>On request</b></li>`;
  return `<li><span>${MODE[m][0]}</span><b>${m === "sale" ? bigMoney(site, v) : money(site, v)}</b>${MODE[m][1] ? `<small> ${MODE[m][1]}</small>` : ""}</li>`;
};

function render() {
  const f = Object.fromEntries(new FormData(form));
  const list = shown.filter((p) => (!f.mode || modesOf(p).includes(f.mode))
    && (!f.building || buildingOf(p) === f.building)
    && (!f.beds || (p.bedrooms || 0) >= Number(f.beds)));
  $("#count").textContent = `${list.length} ${list.length === 1 ? "home" : "homes"} open`;
  history.replaceState(null, "", `?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`.replace(/\?$/, location.pathname));
  $("#units").innerHTML = list.map((p) => {
    const ms = f.mode ? [f.mode] : ["rent", "stay", "sale"].filter((m) => modesOf(p).includes(m));
    const all = f.mode ? [f.mode, ...modesOf(p).filter((m) => m !== f.mode)] : ["rent", "stay", "sale"].filter((m) => modesOf(p).includes(m));
    const specs = [p.bedrooms ? `${p.bedrooms} bedroom${p.bedrooms > 1 ? "s" : ""}` : categoryLabel(p), p.baths && `${p.baths} bath`, p.size, p.guests && `sleeps ${p.guests}`].filter(Boolean).join(" · ");
    const title = p.title.includes(" · ") ? p.title.split(" · ").slice(1).join(" · ") : p.name;
    const href = `property.html?id=${encodeURIComponent(p.id)}${ms[0] ? `&mode=${ms[0]}` : ""}`;
    return `<article class="v7-unit">
      <a class="v7-unit-photo" href="${href}">${p.cover ? pic(p.cover, p.name, { sizes: "(max-width:900px) 100vw, 50vw" }) : ""}</a>
      <div class="v7-unit-text">
        <p class="v7-over"><a href="${buildingHref(buildingOf(p))}">${esc(buildingOf(p))}</a>${p.area ? ` · ${esc(p.area.split(",")[0])}` : ""}</p>
        <h2><a href="${href}">${esc(title)}</a></h2>
        ${availNote(p) ? `<p class="v7-status v7-status-soon">${esc(availNote(p))}</p>` : ""}
        <p class="v7-unit-specs">${esc(specs)}</p>
        <ul class="v7-unit-prices">${all.map((m) => price(p, m)).join("")}</ul>
        <div class="v7-unit-actions">
          <a class="btn btn-primary" href="${href}">View this home</a>
          <a class="v7-more" href="contact.html?about=viewing&unit=${encodeURIComponent(p.id)}">Schedule a viewing</a>
        </div>
      </div>
    </article>`;
  }).join("") || (shown.length ? `<p class="v7-empty">Nothing matches right now. <a href="units.html">Show all homes</a> or <a href="contact.html?about=looking">tell us what you're looking for</a>.</p>` : `<p class="v7-empty">Everything we manage is rented right now. <a href="contact.html?about=looking">Tell us what you're looking for</a> and we'll message you when something opens up.</p>`);
}
form.addEventListener("change", render);
render();
enhanceSelects();
