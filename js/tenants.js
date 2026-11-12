// For tenants and guests: repair requests and questions, sent through the visitor's own chat app or email.
import { loadData, $, $$, esc, demoBar, footer, topbar, icons, buildingOf, wireMessageForm } from "./common.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

for (const el of $$("[data-ic]")) el.innerHTML = icons[el.dataset.ic] || icons.home;

// Units grouped by building, so tenants can say which one is theirs.
const shown = site.properties.filter((p) => p.status !== "hidden");
const groups = [...new Set(shown.map(buildingOf))].map((b) => [b, shown.filter((p) => buildingOf(p) === b)]);
const options = `<option value="">Choose your unit</option>` + groups.map(([b, ps]) => `<optgroup label="${esc(b)}">${ps.map((p) => `<option value="${esc(`${p.name}, ${b}`)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("")
  + `<option value="Another unit">Another unit (I'll say which)</option>`;
for (const s of $$(".unit-pick")) s.innerHTML = options;

const c = site.contact || {};
if (c.phone) { $("#urgent-call").href = `tel:${c.phone.replace(/\s/g, "")}`; $("#urgent-call").innerHTML = `${icons.phone} Call ${esc(c.phone)}`; }
else $("#urgent-call").remove();

wireMessageForm(site, $("#repair-form"), {
  subject: "Repair request",
  sendEl: $("#repair-send"),
  errEl: $("#repair-err"),
  build: (f) => {
    const head = ["REPAIR REQUEST", `Name: ${f.name.value.trim()}`, `Unit: ${f.unit.value}`, `Problem: ${f.kind.value}`, `Urgency: ${f.urgency.value}`];
    const tail = [
      f.when.value.trim() && `Best time to visit: ${f.when.value.trim()}`,
      f.phone.value.trim() && `Mobile: ${f.phone.value.trim()}`,
      f.enter.checked ? "OK to enter while I'm out, if told beforehand." : "Please arrange a time with me before entering.",
    ].filter(Boolean);
    return [head.join("\n"), f.details.value.trim(), tail.join("\n")].join("\n\n");
  },
});

wireMessageForm(site, $("#ask-form"), {
  subject: `Question for ${site.brand}`,
  sendEl: $("#ask-send"),
  errEl: $("#ask-err"),
  build: (f) => `Hi ${site.brand}! I'm ${f.name.value.trim()}${f.unit.value ? `, in ${f.unit.value}` : ""}.\n\n${f.q.value.trim()}`,
});
