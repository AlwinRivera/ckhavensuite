// Our properties: one photo tile per building, linking to the building page.
import { loadData, $, demoBar, footer, topbar } from "./common.js";
import { buildings, buildingTiles } from "./tiles.js";

const { site } = await loadData();
demoBar(site);
topbar(site);
footer(site);

const list = buildings(site);
$("#bldg-tiles").innerHTML = buildingTiles(site, list) || `<p class="muted">Our properties will be listed here soon.</p>`;
$("#bldg-tiles").classList.toggle("odd", list.length % 2 === 1);
