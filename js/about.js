// About: the company story, how we look after a home, and the people.
import { loadData, $, esc, pic, demoBar, footer, topbar } from "./common.js";
import { visible, photoPicker, aboutParagraphs } from "./tiles.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const shown = visible(site);
const c = site.contact || {};
const host = site.host || {};
const take = photoPicker(shown);
const rt = (c.responseTime || "").replace(/^Responds /i, "");

const ph = take(/garden|patio/i, /living/i);
if (ph) $("#about-photo").innerHTML = pic(ph.src, ph.alt || "", { sizes: "(max-width:900px) 100vw, 45vw" });
else $("#about-photo").remove();
$("#about-text").innerHTML = aboutParagraphs(site, shown).map((t) => `<p>${t}</p>`).join("");

$("#care-list").innerHTML = [
  ["Cleaned and checked before you arrive", "Fresh linens and a walk-through of the unit before every new guest or tenant moves in."],
  ["One number for everything", `Viewings, move-in, a broken aircon or a question about the lease: it all goes to ${c.phone ? esc(c.phone) : "the same number"}${rt ? `, and we usually reply ${esc(rt)}` : ""}.`],
  ["Repairs arranged for you", "Tell us what's wrong and we get someone in. You don't need to find a plumber in a city you just moved to."],
  ["Everything in writing", "Rent, deposit and what's included are written down before anyone pays anything."],
].map(([h, p], i) => `<li><span class="care-n">${String(i + 1).padStart(2, "0")}</span><div><h3>${h}</h3><p>${p}</p></div></li>`).join("");

$("#person").innerHTML = `
  <div class="person-face">${host.photo ? `<img src="${esc(host.photo)}" alt="">` : `<span>${esc(host.initial || site.brand[0])}</span>`}</div>
  <div class="person-text">
    <b>${esc(host.name || site.brand)}</b>
    <span>Runs ${esc(site.brand)}${host.cohosts?.length ? ` with ${host.cohosts.map(esc).join(" and ")}` : ""}</span>
    ${host.languages?.length ? `<span>Speaks ${host.languages.map(esc).join(" and ")}</span>` : ""}
    ${c.phone ? `<span><a class="u" href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a></span>` : ""}
  </div>`;
