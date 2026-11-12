// Contact: phone, email and a message form that opens in the visitor's own chat app or email.
// ?about=viewing|owner|resident preselects who's writing; &unit=<id> names the unit to view.
import { loadData, $, esc, demoBar, footer, topbar, wireMessageForm } from "./common.js";
import { enhanceSelects } from "./select.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const c = site.contact || {};
const tel = c.phone ? `tel:${c.phone.replace(/\s/g, "")}` : "";
const rt = (c.responseTime || "").replace(/^Responds /i, "");
for (const [id, key] of [["contact-title", "contactTitle"], ["contact-text", "contactText"]]) {
  if (site.home?.[key]) $("#" + id).textContent = site.home[key].replace(/\*/g, "");
}

$("#talk-info").innerHTML = `
  ${c.phone ? `<p><small>Call or text</small><a href="${tel}">${esc(c.phone)}</a>${rt ? `<span class="v7-note">Usually answered ${esc(rt)}</span>` : ""}</p>` : ""}
  ${c.email ? `<p><small>Email</small><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ""}
  <p><small>Based in</small>Cagayan de Oro, Philippines</p>
  ${c.facebook || c.instagram ? `<p class="v7-social">${c.facebook ? `<a href="${esc(c.facebook)}" target="_blank" rel="noopener">Facebook</a>` : ""}${c.instagram ? `<a href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}</p>` : ""}
  <p><small>Living in one of our units?</small><a class="v7-small-link" href="tenants.html#repair">Report a repair</a></p>`;

const q = new URLSearchParams(location.search);
const who = $("#talk-who");
if (q.get("about") && [...who.options].some((o) => o.value === q.get("about"))) who.value = q.get("about");
const unit = site.properties.find((p) => p.id === q.get("unit"));
const bname = q.get("building");
if (!unit && bname && q.get("about") === "owner") $("#talk-msg").value = `I own a unit at ${bname.slice(0, 80)} and I'd like to talk about you managing it.`;
if (unit) $("#talk-msg").value = `I'd like to view ${unit.name}${unit.building ? ` at ${unit.building}` : ""}. When could I come by?`;

wireMessageForm(site, $("#talk-form"), {
  subject: `Message for ${site.brand}`,
  sendEl: $("#talk-send"),
  errEl: $("#talk-err"),
  build: (f) => [
    `Hi ${site.brand}! I'm ${f.name.value.trim()}, ${who.selectedOptions[0].textContent.toLowerCase()}.`,
    f.msg.value.trim(),
    f.phone.value.trim() && `My number: ${f.phone.value.trim()}`,
  ].filter(Boolean).join("\n\n"),
  // A copy for the team's inbox in the admin (when it's switched on). The visitor's own chat app
  // still opens either way, so a failed copy never loses the message.
  onSend: (f) => {
    if (!site.adminApi || site.demo) return;
    const body = { name: f.name.value, phone: f.phone.value, who: who.value, unit: unit?.id || "", msg: f.msg.value, website: f.website?.value || "" };
    fetch(site.adminApi.replace(/\/$/, "") + "/api/enquire", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  },
});
enhanceSelects();
