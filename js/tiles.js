// Shared pieces for the company pages: building tiles (home and Our properties), the about text,
// and photo lookups by room name, so new listings bring their own photos.
import { esc, money, pic, placeOf, priceOf, buildingOf, buildingHref, buildingInfo, availOf } from "./common.js";

export const visible = (site) => site.properties.filter((p) => p.status !== "hidden");
export const roomPhotos = (p, re) => (p.tour || []).filter((r) => re.test(r.room || "")).flatMap((r) => r.photos);

/** Photo picker that never hands out the same photo twice on one page. */
export function photoPicker(shown) {
  const used = new Set();
  const all = (re) => shown.flatMap((p) => roomPhotos(p, re).map((ph) => ({ ...ph, p })));
  return (...res) => {
    for (const re of res) {
      const x = all(re).find((ph) => !used.has(ph.src));
      if (x) { used.add(x.src); return x; }
    }
    return null;
  };
}

export function buildings(site, shown = visible(site)) {
  return [...new Set(shown.map(buildingOf))].map((name) => {
    const ps = shown.filter((p) => buildingOf(p) === name);
    const info = buildingInfo(site, name);
    const shared = info?.photo ? { src: info.photo, alt: name } : ps.flatMap((p) => roomPhotos(p, /pool|amenit|lobby|exterior|grounds|building/i))[0];
    const open = ps.filter((p) => availOf(p) !== "rented");
    const lo = (m) => { const v = open.map((p) => priceOf(p, m)).filter(Boolean); return v.length ? Math.min(...v) : null; };
    return { name, ps, open, info, w: placeOf(ps[0]), area: info?.area || ps.find((p) => p.area)?.area || "", photo: shared || { src: ps.find((p) => p.cover)?.cover, alt: name }, rentFrom: lo("rent"), stayFrom: lo("stay") };
  }).sort((a, b) => b.ps.length - a.ps.length || a.name.localeCompare(b.name));
}

/** Photo tiles with the building name on the photo. */
export function buildingTiles(site, list) {
  return list.map((b) => {
    const from = [b.rentFrom && `Rent from ${money(site, b.rentFrom)} a month`, b.stayFrom && `short stays from ${money(site, b.stayFrom)} a night`].filter(Boolean).join(" · ");
    return `<a class="v7-tile" href="${buildingHref(b.name)}">
      ${b.photo?.src ? pic(b.photo.src, b.photo.alt || b.name, { sizes: "(max-width:1220px) 100vw, 1180px" }) : ""}
      <span class="v7-tile-text">
        <small>${esc([b.area.split(",")[0], b.w.city].filter(Boolean).join(" · "))}</small>
        <b>${esc(b.name)}</b>
        <span>${b.ps.length} ${b.ps.length === 1 ? "unit" : "units"} managed by us${from ? ` · ${esc(from)}` : ""}</span>
        <em>View property</em>
      </span>
    </a>`;
  }).join("");
}

/** The company story, in plain sentences built from the data (no claims the data can't back). */
export function aboutParagraphs(site, shown = visible(site)) {
  // Their own words from Admin → Website → About us win over the standard text.
  if (site.about?.length) return site.about.map(esc);
  const host = site.host || {};
  const team = [host.name, ...(host.cohosts || [])].filter(Boolean);
  const own = shown.find((p) => p.rating?.count);
  const where = own ? placeOf(own) : null;
  return [
    `${esc(site.brand)} is a small property management company in Cagayan de Oro${team.length ? `, run by ${esc(team.join(" and "))}` : ""}.`,
    own ? `We started with our own condo at ${esc(buildingOf(own))}${where?.city ? ` in ${esc(where.city)}` : ""}, renting it out to monthly tenants and short-stay guests${host.yearsHosting ? ` for the last ${host.yearsHosting} years` : ""}. Guests rate it ${own.rating.value} out of 5 across ${own.rating.count} reviews.` : "",
    "Now we do the same for owners who can't be there themselves: finding and checking tenants or guests, collecting rent, and keeping the unit clean and in good repair.",
  ].filter(Boolean);
}
