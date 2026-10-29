# FiveM compliance check

Audit of everything in `js-snippets/` and `tools/` against the Cfx.re rules, run 29 Oct 2026.

**Not legal advice, and not complete.** `static.cfx.re` is blocked from the cloud session that ran this, so the
Creator Platform License Agreement itself could not be read — only third-party summaries of it. Before you take
money for anything, read the current text at [fivem.net/terms](https://fivem.net/terms) yourself. The agreement was
last updated 12 Jan 2026 and the monetization sections have been changing.

## Verdict

Nothing built so far sells anything for real money, so there is nothing to breach today. Two things to fix and one
rule to hold to as you grow.

## What was checked, and is clean

| Check | Result |
|---|---|
| Any payment integration (Tebex, Stripe, PayPal, Patreon) | **None.** Tebex appears only in warning comments and in the secret scrubber |
| Can gold be bought with real money? | **No.** Gold is not in `ACCOUNTS`, so `/pay`, `/deposit`, `/withdraw` and `givemoney` cannot touch it. It is earned from on-duty paychecks, EMS revives and mechanic repairs |
| Can anything else be bought with real money? | **No.** Guns cost earned gold, everything else costs in-game dollars |
| Loot boxes or chance-based purchases | **None.** The only randomness is the robbery payout and spawn choice, neither of which costs anything |
| Is any CitizenFX code copied or shipped? | **No.** All 20 files in `js-snippets/` are original. The `fivem` repo was never read from or modified |
| Credentials in the repo | **None.** `tools/join-server.js` scrubs the Cfx key, rcon password, Steam key, MySQL string and Tebex secret, and stops if anything else looks like a secret |
| Cheat or exploit tooling | **None.** Every system is server-authoritative — ammo, vehicle damage and taxi distance all refuse numbers a client inflates |

## Fix these two

**1. `givegold` is the one way real money could leak in.**
It is console-only, which is right, but an admin running it after someone pays for gold would be selling in-game
currency, which the agreement prohibits. The code cannot stop that — it is a house rule. Keep `givegold` for events
and prizes, and never wire it to a payment webhook or hand it to staff who take payments.

**2. `LICENSE` still says `Copyright (c) [year] [fullname]`.**
An MIT licence with the placeholders left in does not name a copyright holder. One-line fix, yours to make since it
is your name that goes in it.

## Names worth a second look

Cfx.re has advised servers to remove content tied to real-world third-party intellectual property. These are ours,
in order of risk. All are your creative call — say the word and I will rename any of them.

| Name | Why it stands out |
|---|---|
| **Guccilucci** (drink item) | Plays on Gucci, a live luxury trademark, and on Gucci Mane. The highest-risk name in the project |
| **1017** (Atlanta area code) | Gucci Mane's record label. Fine as a nod, but it is someone's brand, not a real area code |
| **Black Draco** (rifle) | "Draco" is a real firearm model sold by Century Arms. Lower risk, since firearm names get used widely |
| **Glizzy** (pistol) | Slang, not a trademark. No concern |

Rockstar's own names — Ammu-Nation, Del Perro Pier, Legion Square, Paleto, Sandy Shores, Grapeseed, Little Seoul,
LTD, 24/7, Micro SMG — are base-game references, which is normal for every FiveM server. Reporting on the January
agreement says its wording about Rockstar-created items is contested and unclear. Low risk, worth watching.

Real city names (Atlanta, Chicago) are place names, not IP.

## The rule to hold to

If you ever monetize:

- **Tebex only.** Reporting says Cfx.re names it the sole authorized partner, and any other processor breaches the
  agreement. Do not take payments through PayPal, Stripe or a donation link tied to the server.
- **Never sell gold, dollars, guns, ammo, vehicles, items or anything that changes what a player can do in-game.**
- **Cosmetics only** — outfits, liveries, emotes, name colours. That is what your own marketplace notes concluded,
  and it still holds.
- A VIP flag is fine as long as what it unlocks is cosmetic. The moment it unlocks a gun or a discount, it is
  pay-to-win and a breach.

## Sources

Third-party summaries, not the agreement itself:

- [FiveM Server Monetisation: What the Cfx.re Rules Actually Allow](https://www.gameserverkings.com/knowledge-base/fivem/server-monetisation/)
- [Clarification of new FiveM Terms of Service regarding selling of "virtual items" — Cfx forum](https://forum.cfx.re/t/clarification-of-new-fivem-terms-of-service-regarding-selling-of-virtual-items/5377401)
- [GTA RP players advised to remove content relating to real-world third-party IPs](https://hitmarker.net/news/gta-rp-players-advised-to-remove-any-content-relating-to-real-world-third-party-ips-516282)
- The agreement itself: `https://static.cfx.re/platform-license-agreement-12-jan-2026.pdf` (could not be read from this session)
