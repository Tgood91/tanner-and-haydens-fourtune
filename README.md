# tanner-KAOS-haydens-fourtune
game
# better name when public.
# this is Tgood91 pooling knowledge, so Tgood91s crew will have no worries in the future
####
###
##
#
Inventory is built and verified. Phase 1's first piece is done:
What you got
•
New inventory resource alongside your jobs/vehicles — 12 starter items (water, sandwich, coffee, donut, glizzy dog? bandage, medkit, phone, radio, repair kit, toolbox, lockpick, fuel can), each with a weight, and a 80 kg carry limit
•
Server-authoritative, same rule as your economy: adding, removing, using, and dropping are all validated on the server — item exists, you actually hold it, weight limit, counts checked. Clients can only send requests, so a modded client can't conjure items
•
Using an item consumes exactly 1, and only after validation (a bandage won't even consume at full health). Dropping removes it server-side first; the prop on the ground is visual only for now
•
Persistence rides the same road as your money — inventory sits on the character, flows through autosave/disconnect save into the API, with a proper inventory_items table on the MySQL side. No new endpoints, no double-apply risk
•
New characters start with water ×2, sandwich ×1, phone ×1 — and only if they've never had an inventory saved; an emptied inventory stays empty
•
In-game: /inventory, /useitem <item>, /dropitem <item>; item grants are server-console only (giveitem), no in-game admin command to abuse
Verification, real numbers
•
25/25 Lua files parse (21 old + 4 new)
•
26/26 logic checks passed running the actual server code headless — weight edge cases included (exactly 30.0 kg allowed, 30+ refused)
•
API round-trip live-tested: starter inventory, a mutated inventory, and an empty one all save and reload exactly; the 401 on unauthenticated writes is intact
Write-up is in docs/INVENTORY.md, and the roadmap now marks inventory done. Left for later, documented but not built: world pickups other players can grab, hunger/thirst, shops, trunk inventories. The in-game smoke test happens whenever your FXServer runs — that's the Cfx key step, still untouched.
And it loops back to your Lua lessons nicely: Lesson 2's function shape is exactly how this resource's AddItem/UseItem are written, if you want to read a real one next.
