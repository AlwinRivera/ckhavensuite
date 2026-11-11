# CK Haven Suite

Website for CK Haven's short-stay and monthly-rental units. It's a static site on GitHub Pages
with free hourly Airbnb and Booking.com calendar sync. Running cost: ₱0. See [PLAN.md](PLAN.md).

## Pages
- `index.html`: home page
- `property.html?id=<unit>`: unit page with live calendar and booking request
- `owner.html`: owner view of every channel's bookings (not linked publicly)

## Run locally
```bash
node scripts/serve.mjs
```
Then open http://localhost:8080.

## Edit content
- Units, prices, photos, contacts, iCal links: `data/site.json`
- Direct bookings: `data/direct-bookings.json`
- Refresh calendars by hand: `node scripts/sync-calendars.mjs` (GitHub Actions also runs it every hour)
- Prices show as estimates ("From ₱…", "estimated total") and requests ask the host for the total until
  that rate has `"confirmed": true` in `site.json`. Same for `promos.earlyBird`, which stays hidden until confirmed.
- `"demo": false` (current) shows only real data. Set it to `true` to show a banner and labelled sample bookings
  (handy for showing off the calendar before the iCal links exist).

## Images
Each photo in `assets/img/` has `-640.webp` and `-1280.webp` versions that the site serves to modern browsers.
When you add a photo, create both versions too (any image tool works; the build used ffmpeg).

## Share previews
Facebook and Messenger only read **absolute** `og:image` URLs. After deploying, change
`content="assets/brand/og.jpg"` in `index.html` and `property.html` to the full URL,
for example `https://<user>.github.io/ckhavensuite/assets/brand/og.jpg`.

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
