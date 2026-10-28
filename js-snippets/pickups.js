// ============================================================
// pickups.js — dropped items other players can grab
// Dropping takes the item out of YOUR bag first (server-side), then
// it sits on the ground as a pickup. First player close enough who
// has room gets it. Pickups vanish after PICKUP_LIFETIME_MIN so the
// world doesn't fill up with litter.
// ============================================================

const inventory = require("./inventory");
const { distance } = require("./cities");

const GRAB_RANGE = 2.0;          // metres
const PICKUP_LIFETIME_MIN = 10;

function createPickups() {
    const pickups = new Map(); // id -> { id, item, count, pos, droppedBy, expiresAt }
    let nextId = 1;

    function drop(c, item, count, pos, now) {
        const removed = inventory.dropItem(c.inventory, item, count);
        if (!removed.ok) return removed;

        const id = nextId++;
        pickups.set(id, {
            id, item, count,
            pos: { ...pos },
            droppedBy: c.id,
            expiresAt: now + PICKUP_LIFETIME_MIN * 60 * 1000,
        });
        return { ok: true, msg: removed.msg, pickupId: id };
    }

    function nearest(pos) {
        let best = null;
        for (const p of pickups.values()) {
            const d = distance(pos, p.pos);
            if (d <= GRAB_RANGE && (!best || d < best.d)) best = { p, d };
        }
        return best ? best.p : null;
    }

    function grab(c, pos) {
        const p = nearest(pos);
        if (!p) return { ok: false, msg: "Nothing here to pick up" };

        const added = inventory.addItem(c.inventory, p.item, p.count);
        if (!added.ok) return added; // too heavy: pickup stays on the ground
        pickups.delete(p.id);
        return { ok: true, msg: `Picked up ${p.count}x ${inventory.ITEMS[p.item].label}`, pickupId: p.id };
    }

    // Returns the ids that expired, so the game can delete their props.
    function expire(now) {
        const gone = [];
        for (const [id, p] of pickups) {
            if (now >= p.expiresAt) {
                pickups.delete(id);
                gone.push(id);
            }
        }
        return gone;
    }

    return { drop, grab, nearest, expire, all: () => [...pickups.values()] };
}

module.exports = { GRAB_RANGE, PICKUP_LIFETIME_MIN, createPickups };
