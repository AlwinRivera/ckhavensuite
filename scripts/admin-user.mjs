// Creates an admin login.
//   node scripts/admin-user.mjs --email ckoasishaven@gmail.com --name Khandy [--role owner|cohost]
// Prints a new random password and the JSON entry to put in the Worker's ADMIN_USERS secret
// (a JSON list of these entries). With --dev it is added to .admin-dev/users.json for local testing.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../worker/src/auth.js";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split(/\s*--/).filter(Boolean).map((a) => {
  const [k, ...v] = a.split(" ");
  return [k, v.join(" ") || true];
}));
if (!args.email || !args.name) {
  console.log("Usage: node scripts/admin-user.mjs --email you@example.com --name \"Your name\" [--role owner|cohost] [--dev]");
  process.exit(1);
}
const role = args.role === "cohost" ? "cohost" : "owner";
// Readable password: 4 groups of 4, about 80 bits.
const password = args.password && args.password !== true ? args.password
  : randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).match(/.{1,4}/g).join("-");
const entry = { email: args.email.trim(), name: args.name.trim(), role, ...(await hashPassword(password)) };

if (args.dev) {
  const dir = new URL("../.admin-dev/", import.meta.url);
  await mkdir(dir, { recursive: true });
  const file = new URL("users.json", dir);
  const list = JSON.parse(await readFile(file, "utf8").catch(() => "[]")).filter((u) => u.email.toLowerCase() !== entry.email.toLowerCase());
  list.push(entry);
  await writeFile(file, JSON.stringify(list, null, 2));
  await writeFile(new URL(`login-${entry.email.replace(/[^a-z0-9]+/gi, "_")}.txt`, dir), `Local admin login\nEmail: ${entry.email}\nPassword: ${password}\n`);
  console.log(`Added ${entry.email} (${role}) to .admin-dev/users.json. Password saved in .admin-dev/. Restart scripts/admin-dev.mjs.`);
} else {
  console.log(`Password for ${entry.email}: ${password}\n(Give it to them privately. They can't see it again.)\n`);
  console.log("Add this entry to the ADMIN_USERS list:");
  console.log(JSON.stringify(entry));
}
