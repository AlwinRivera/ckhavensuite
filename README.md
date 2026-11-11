# CK Haven Suite

Website for CK Haven's short-stay and monthly-rental units. It's a static site on GitHub Pages
with free hourly Airbnb and Booking.com calendar sync. Running cost: ₱0. See [PLAN.md](PLAN.md).

## Pages
- `index.html`: home page
- `property.html?id=<unit>`: unit page with live calendar and booking request
- `admin/`: host admin (login) for the calendar, listing details, photos, prices and site text. See **Host admin** below

## Run locally
```bash
node scripts/serve.mjs
```
Then open http://localhost:8080.

## Edit content
The easy way is the host admin at `/admin/` (below). Everything it changes lives in these files, which you can also edit by hand:
- Units, prices, photos, contacts, iCal links: `data/site.json`
- Direct bookings: `data/direct-bookings.json`
- Refresh calendars by hand: `node scripts/sync-calendars.mjs` (GitHub Actions also runs it every hour)
- Prices show as estimates ("From ₱…", "estimated total") and requests ask the host for the total until
  that rate has `"confirmed": true` in `site.json`. Same for `promos.earlyBird`, which stays hidden until confirmed.
- `"demo": false` (current) shows only real data. Set it to `true` to show a banner and labelled sample bookings
  (handy for showing off the calendar before the iCal links exist).

## Host admin
`/admin/` is a login-only host app, laid out like a host app on Airbnb:

| Tab | What it does | Who |
|---|---|---|
| Today | Check-ins, check-outs, upcoming stays, calendar sync status, setup to-dos | Owner, co-host |
| Calendar | Block and unblock nights for direct bookings; Airbnb and Booking.com nights show read-only | Owner, co-host |
| Listing | Photos (upload, reorder, cover, captions), title and description, rooms, prices, amenities, location, rules, booking links and iCal, reviews, live/hidden, add a property | Owner |
| Website | Business name, home page text, contact buttons, host profile, advanced settings | Owner |
| Changes | Every save with who and when, and "Go back to this" to undo | Owner |

The admin edits content, not layout, so nothing can break the design. Each save is a commit to this repo
(so GitHub Pages republishes in about a minute) and there's always a version to go back to.

**How it works:** the page is static, so saving goes through a small API (`worker/`) on Cloudflare Workers'
free plan. It checks the login, validates the change and commits it with a GitHub token that never reaches the browser.

### Set it up (once, about 15 minutes, free)
1. **GitHub token:** GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access:
   only this repo. Permissions: **Contents: Read and write**. Copy the token.
2. **Cloudflare:** make a free account at dash.cloudflare.com, then on your computer:
   ```bash
   cd worker
   npx wrangler login
   ```
3. Edit `worker/wrangler.toml`: set `GITHUB_REPO` (for example `ckhaven/ckhavensuite`) and `ALLOWED_ORIGINS`
   (your Pages address without the path, for example `https://ckhaven.github.io`).
4. **Logins:** run once per person and send each their password privately:
   ```bash
   node scripts/admin-user.mjs --email them@example.com --name Khandy --role owner
   ```
   Use `--role cohost` for someone who should only manage the calendar. Put the printed entries in one JSON list: `[{…}, {…}]`.
5. **Secrets:**
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put ADMIN_USERS
   ```
   (`SESSION_SECRET`: any long random text. `ADMIN_USERS`: the JSON list from step 4.)
6. Deploy with `npx wrangler deploy` and copy the `https://ckhaven-admin.<you>.workers.dev` address it prints.
7. Put that address in `data/site.json` → `adminApi`, commit, and open `https://<you>.github.io/ckhavensuite/admin/`.

Optional: `npx wrangler kv namespace create RATE` and paste the id into `wrangler.toml` for stronger
login rate limiting. To change a password or remove someone, re-run step 4 and update `ADMIN_USERS`; removing
a person logs them out at once. Logins last 30 days.

### Demo (no setup)
Open `/admin/?demo`, or tap **Try the demo, no login** on the login page. The whole admin runs in the browser tab with no
admin service and no password; saves, blocked dates and undo all work, but nothing reaches the real website and it resets
when the tab closes. Handy for showing the owners before logins exist.

### Try it locally
```bash
node scripts/admin-user.mjs --email owner@ckhaven.test --name Khandy --dev
node scripts/admin-dev.mjs
```
With `node scripts/serve.mjs` running too, open http://localhost:8080/admin/. The password is in
`.admin-dev/` (git-ignored). Saves write straight to your working copy instead of GitHub.

## Images
Each photo in `assets/img/` has `-640.webp` and `-1280.webp` versions that the site serves to modern browsers.
Photos uploaded in the admin get these made automatically in the browser. If you add a photo by hand, create both versions too (any image tool works; the build used ffmpeg).

## Share previews
Facebook and Messenger only read **absolute** `og:image` URLs, and search engines want a canonical link and a sitemap.
After deploying, put the site's address in `data/site.json` → `siteUrl` (for example `https://<user>.github.io/ckhavensuite/`) and run:
```bash
node scripts/site-url.mjs
```
It makes the share image and structured-data images absolute, adds `og:url` and `<link rel="canonical">`, and writes `sitemap.xml` plus the `Sitemap:` line in `robots.txt`.
`404.html` assumes the site lives at `/ckhavensuite/`; change its three links if you move to a custom domain.

## Analytics (optional, free)
Create a GoatCounter site and put its code in `data/site.json` → `analytics.goatcounter`.
It counts page views plus clicks on "Request to book", each contact channel, Share and the Airbnb link.

## Deploy (free)
1. Push this folder to a **public** GitHub repo
2. Settings → Pages → Deploy from branch → `main` / root
3. Settings → Actions → General → Workflow permissions → **Read and write** (lets the sync job commit)

The sync job checks every hour but only commits when booked dates actually change (in demo mode, the sample dates move once a week).
GitHub pauses scheduled workflows in a repo with no activity for 60 days. If the calendar stops updating, open
Actions → Sync calendars → Enable workflow (or push any commit).
