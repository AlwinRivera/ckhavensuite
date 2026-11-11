# CK Haven Suite: plan

Brief from the client (Uncle Xtian, 11 Nov 2026):

1. Websites for the properties
2. Integrate Booking.com, Airbnb, IG, FB, etc.
3. Include rentals (monthly/long-term as well as nightly stays)

Budget rule: **₱0 running cost** until the site earns its keep. Every piece below
has a free tier that is enough for a handful of units. Paid upgrades come only
after direct bookings cover them.

---

## 1. Architecture (all free)

```
 Airbnb ──iCal export──┐                         ┌── Airbnb imports our .ics
 Booking ─iCal export──┼─> GitHub Action (hourly)┼── Booking imports our .ics
 direct-bookings.json ─┘   scripts/sync-calendars │
                               │                  │
                               ▼                  │
                     data/availability.json  +  ical/<unit>.ics
                               │
                               ▼
                 GitHub Pages static site (this repo)
        home · property pages · availability calendar · host admin
                               │
                guest picks dates → request goes to
              WhatsApp / Messenger / email (no backend)
```

| Need | Free solution | Limit that matters |
|---|---|---|
| Hosting | GitHub Pages | 1 GB repo, 100 GB/mo bandwidth |
| Domain | `*.github.io` for now | custom domain ~₱700/yr later |
| Airbnb / Booking.com sync | **iCal** import/export, both directions | Airbnb refreshes imported calendars every ~2–3 h |
| Calendar fetch job | GitHub Actions cron | free on public repos |
| Booking requests | pre-filled WhatsApp / Messenger / email message | owner confirms by hand |
| Payments | GCash / Maya QR shown after confirmation | manual check |
| FB / IG | links, Messenger `m.me` link, share buttons | no API keys needed |
| Analytics (later) | Cloudflare Web Analytics or GoatCounter | free |

### Why iCal and not the Airbnb/Booking APIs

Airbnb and Booking.com only give API access to approved channel managers
(Hostaway, Guesty, etc., about ₱1,500–3,000 per unit per month). Both platforms
support **iCal calendar sync** for every host for free. That's enough to:

- show live availability on our site, and
- push direct bookings back out so Airbnb/Booking block those dates (no double bookings).

Prices and payments stay on each platform. That's fine at this size.

---

## 2. What's in the demo (this repo)

- `index.html`: brand home page: hero, units, short stays vs monthly rentals,
  video tour, guest notes, FB/IG/Airbnb/Booking links, contact
- `property.html?id=…`: gallery, amenities, live availability calendar, date
  picker, price estimate, "Request on WhatsApp / Messenger / Email",
  "Book on Airbnb / Booking.com"
- `admin/` + `worker/`: host admin with logins (owner and co-host). Today, Calendar (block/unblock direct
  bookings), Listing (photos, text, prices, amenities, rules, iCal links, reviews, add a property), Website
  (brand, home text, contacts, host profile) and Changes (history with undo). Saves are commits made by a
  free Cloudflare Worker, so the site stays static and `₱0`.
- `data/site.json`: everything the admin edits: units, prices, photos, contacts, iCal links, home page text
- `data/direct-bookings.json`: direct bookings and blocked nights (written by the admin's Calendar)
- `scripts/sync-calendars.mjs` + `.github/workflows/sync-calendars.yml`:
  hourly sync, no dependencies
- Adding a property = "+ Add a property" in the admin (starts hidden until it's ready)

No sample data is left on the site. Until the iCal links are added, the calendar shows every date as open and
the site says availability is confirmed in chat. Setting `"demo": true` brings back labelled sample bookings for showing the calendar off.

---

## 3. Phases

**Phase 0: Demo (today).** Static site on GitHub Pages with real listing data; availability confirmed in chat until the iCal links are added.

**Phase 1: Go live (₱0).** Needs the client's input (see questions below).
1. Real prices, address/map pin, house rules, check-in/out times
2. Paste Airbnb + Booking.com iCal export URLs into `site.json`
3. Paste our `ical/<unit>.ics` URL into Airbnb & Booking "import calendar"
4. Real WhatsApp number, Messenger page username, IG handle
5. Turn on Pages, share link in FB/IG bio and Airbnb guest messages

**Phase 2: Earn (still ₱0).**
- Put a "book direct, save ~10–15%" message on the site. Airbnb's guest fee plus the host fee, or
  Booking.com's ~15% commission, is the money direct bookings keep.
- QR card in the unit pointing to the site for repeat guests
- Google Business Profile (free) linking to the site

**Phase 3: Paid upgrades, only when direct bookings pay for them.**
| Upgrade | Cost | Trigger |
|---|---|---|
| Custom domain (ckhavensuite.com) | ~₱700/yr | first direct booking |
| Online deposit via PayMongo (GCash/card) | ~3% per transaction, no monthly fee | owner tired of manual GCash checks |
| Instant booking + auto-confirm (Cloudflare Workers + D1, free tier) | ₱0–₱300/mo | >5 direct bookings/mo |
| Channel manager (two-way rates & instant sync) | ~₱1.5k+/unit/mo | 4+ units or frequent double-booking scares |

---

## 4. What's real vs placeholder (as of 11 Nov 2026)

Pulled from the public Airbnb listing, FB page and Instagram:
- Unit: 1BR ground-floor condo, One Oasis, Brgy. Camaman-an, CDO. 4 guests, queen bed + sofa bed, 1 bath
- Airbnb: rooms/50234618, **4.8 from 44 reviews**, category scores, recent reviews
- Host: Khandy Lorraine, 5 yrs hosting, co-host Elizabeth, 100% response rate, replies within an hour
- Check-in 2–5 PM, checkout before 12 PM, self check-in with lockbox; parking ₱300/night
- Contact: 0906 506 2589, ckoasishaven@gmail.com, FB `CKHaven1133`, IG `ckoasishaven`
- Promo (FB reel): 10% off when booking 7+ days before check-in (hidden on the site until confirmed)
- Booking.com listing: https://www.booking.com/hotel/ph/ck-haven-hot-shower-wifi-smart-tv-outdoor-garden.html (rated 7.7 from 3 reviews; shows from ₱1,615/night in Dec 2026)
- Logo: FB profile picture (cropped mark in `assets/brand/`)

Still placeholder or unconfirmed:
- **Nightly ₱1,615** is the Booking.com rate, not his direct rate. Monthly **₱23,000** is read from a low-res FB reel.
  Both are shown as "From … · estimated", and booking requests ask him for the total instead of quoting one.
  Set `"confirmed": true` on a rate (and on `promos.earlyBird`) in `site.json` once he confirms it.
- Booked dates: none shown until the Airbnb and Booking.com iCal export links are added
- Max guests: Airbnb says 4, Booking.com says 2. Bed: site says queen, Booking.com says full
- Whether the number is on WhatsApp and Viber, or just calls and texts
- Kids' play area (from FB photo captions); fire extinguisher (seen in a photo)
- Living room, kitchen-counter and bathroom photos are stills taken from the walkthrough videos

## 5. Questions for Uncle Xtian

1. Direct nightly rate (Booking.com shows ₱1,615), weekend rate, monthly rate (₱23k?), cleaning fee, deposit, and is the 10% early-bird still on?
2. Airbnb calendar iCal export link (Airbnb → Calendar → Availability → Connect calendars → Export)
3. Booking.com iCal export link (Extranet → Rates & availability → Sync calendars)
4. Is 0906 506 2589 on WhatsApp and/or Viber?
5. Original high-res photos (the Airbnb set: living room with TV, pool, bathroom) and a host photo
6. House rules (smoking, pets, visitors, quiet hours) and cancellation terms for direct bookings
7. Okay to show Airbnb review excerpts and the "Good Vibes Only" notes on the site?
8. Any other units, or "rentals" meaning something other than monthly stays?
