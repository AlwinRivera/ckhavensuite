// Run once the site has its public address (data/site.json → siteUrl, e.g. https://ckhaven.github.io/ckhavensuite/):
//   node scripts/site-url.mjs
// Makes share-preview images and canonical links absolute (Facebook/Messenger ignore relative ones)
// and writes sitemap.xml + the robots.txt Sitemap line. Safe to run again after changing siteUrl.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const write = (p, s) => writeFile(new URL(p, root), s);

const site = JSON.parse(await read("data/site.json"));
const base = (process.argv[2] || site.siteUrl || "").trim().replace(/\/?$/, "/");
if (!/^https:\/\/[^/]+\//.test(base)) {
  console.error("Set data/site.json → siteUrl to the site's https:// address first (or pass it as an argument).");
  process.exit(1);
}
const abs = (p) => (/^https?:/.test(p) ? p : base + p.replace(/^(\.\/|\/)/, ""));
const first = site.properties.find((p) => p.status !== "hidden") || site.properties[0];
const pages = [
  { file: "index.html", url: base },
  { file: "property.html", url: `${base}property.html?id=${encodeURIComponent(first.id)}` },
];

for (const { file, url } of pages) {
  let html = await read(file);
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)">/)[1].replace(/^https?:\/\/[^"]*?\/(assets\/)/, "$1");
  html = html
    .replace(/<meta property="og:image" content="[^"]+">/, `<meta property="og:image" content="${abs(ogImage)}">`)
    .replace(/\n\s*<meta property="og:url"[^>]*>/, "")
    .replace(/\n\s*<link rel="canonical"[^>]*>/, "")
    .replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${url}">\n  <link rel="canonical" href="${url}">`)
    .replace(/("(?:image|logo)": ")([^"]+)(")/g, (_, a, p, z) => a + abs(p.replace(/^https?:\/\/.*?\/(assets\/)/, "$1")) + z);
  await write(file, html);
}

await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${p.url.replace(/&/g, "&amp;")}</loc></url>`).join("\n")}
</urlset>
`);
const robots = (await read("robots.txt")).replace(/\nSitemap:.*$/m, "").trimEnd();
await write("robots.txt", `${robots}\nSitemap: ${base}sitemap.xml\n`);
console.log(`Absolute URLs set for ${base}; wrote sitemap.xml and robots.txt.`);
