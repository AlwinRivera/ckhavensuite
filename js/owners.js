// For owners: the property management offer.
import { loadData, $, esc, demoBar, footer, topbar, icons, channelList, openChannel, listingCard, wireCards, modesOf } from "./common.js";

const { site, avail } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const c = site.contact || {};
const first = (site.host?.name || "").split(" ")[0] || "there";

$("#svc-grid").innerHTML = [
  [icons.users, "Finding tenants", "Listing the unit here and on Facebook, answering enquiries and showing it to people who are a good fit."],
  [icons.shield, "Checking tenants", "Meeting applicants, checking IDs and references, and preparing a clear written lease."],
  [icons.cal, "Short-stay hosting", "Running the unit on Airbnb and Booking.com: pricing, the calendar, guest messages and check-in."],
  [icons.tag, "Rent and deposits", "Collecting rent, following up late payments, holding deposits and sending you a monthly report."],
  [icons.key, "Repairs and upkeep", "Taking repair requests from tenants, arranging workers and checking on the unit regularly."],
  [icons.spark, "Cleaning and turnover", "Cleaning between guests and between tenants, fresh linens for stays, and getting the unit ready to show."],
].map(([ic, h, p]) => `<div class="svc"><h3>${h}</h3><p>${p}</p></div>`).join("");

$("#plan-list").innerHTML = [
  ["Tenant placement", "For owners who'll manage the tenant themselves.", ["Listing, enquiries and viewings", "Tenant checks and a written lease", "Move-in inventory and photos"], false],
  ["Full management", "For owners who want it handled from start to finish.", ["Everything in tenant placement", "Rent collection and a monthly report", "Repairs, upkeep and regular checks", "Renewals and move-outs"], true],
  ["Short-stay hosting", "For units rented by the night or week.", ["Airbnb and Booking.com listings", "Pricing and calendar", "Guest messages and check-in", "Cleaning and linens between stays"], false],
].map(([h, p, items, main]) => `<div class="plan${main ? " main" : ""}">
    ${main ? `<span class="plan-tag">Most owners choose this</span>` : ""}
    <h3>${h}</h3><p class="muted">${p}</p>
    <ul>${items.map((x) => `<li>${icons.check}<span>${esc(x)}</span></li>`).join("")}</ul>
    <div class="plan-fee"><small>Fee</small><b>Quoted per property</b></div>
  </div>`).join("");

// A couple of the real unit pages, to show owners what theirs would look like.
const live = site.properties.filter((p) => p.status !== "hidden");
const show = live.slice(0, 2);
if (show.length) {
  $("#show-cards").innerHTML = show.map((p) => listingCard(site, avail, p, { mode: modesOf(p)[0] })).join("");
  wireCards($("#show-cards"));
} else $("#showcase").remove();

const ask = `Hi ${first}! I own a property and I'd like to ask about ${site.brand} managing it.\n\nType and location: \nWhat I need help with: `;
const chans = channelList(site, ask, `Property management with ${site.brand}`);
$("#owner-ask").addEventListener("click", () => openChannel(chans.find((x) => x.key === "whatsapp") || chans.find((x) => x.key === "messenger") || chans[0], ask));
if (c.phone) { const b = $("#owner-call"); b.href = `tel:${c.phone.replace(/\s/g, "")}`; b.textContent = `Call ${c.phone}`; }
