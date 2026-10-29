// ============================================================
// taxi.js — calling a cab, driving the fare, getting paid
//
// How a ride runs:
//   1. anyone        /taxi            puts a call out to on-duty drivers
//   2. a driver      /accept <id>     claims it — one driver per call
//   3. that driver   /startfare <id>  meter starts, and only within
//                                     PICKUP_RANGE of the passenger
//   4. that driver   /endfare         passenger is billed, driver paid
//
// The meter runs on DISTANCE ACTUALLY DRIVEN, counted from the
// driver's position sweep, with the same teleport guard fuel.js uses.
// So a driver can't bill for a ride they didn't drive, and the fare
// is honest whether they took the highway or the back roads.
//
// If the passenger can't cover it they pay what they have — the ride
// already happened, and leaving a fare half-finished would wedge both
// players. Drivers can refuse a known deadbeat the next time.
//
// Fares, ranges and the call timeout are placeholders.
// ============================================================

const economy = require("./economy");
const { distance } = require("./cities");

const FARE_BASE = 30;          // flag drop
const FARE_PER_100 = 8;        // dollars per 100 units driven
const FARE_GOLD = 5;           // to the driver, per completed fare
const PICKUP_RANGE = 8.0;      // metres: how close to start the meter
const CALL_EXPIRY_MIN = 5;     // an unclaimed call goes stale
const MAX_TRUSTED_MOVE = 300;  // more than this between sweeps is a teleport

function isDriver(c) {
    if (c.job.name !== "taxi") return { ok: false, msg: "Only taxi drivers can do that" };
    if (!c.onDuty) return { ok: false, msg: "Clock in first (/duty)" };
    return { ok: true, msg: "" };
}

function fareFor(units) {
    return FARE_BASE + Math.round((units / 100) * FARE_PER_100);
}

function createDispatch() {
    const calls = new Map(); // passenger id -> { passengerId, name, pos, at, driverId }
    const rides = new Map(); // driver id -> { passengerId, units, lastPos }

    function rideWithPassenger(id) {
        for (const [driverId, ride] of rides) if (ride.passengerId === id) return { driverId, ride };
        return null;
    }

    function callCab(c, now) {
        if (calls.has(c.id)) return { ok: false, msg: "You already have a cab on the way" };
        if (rides.has(c.id)) return { ok: false, msg: "You're driving a fare right now" };
        if (rideWithPassenger(c.id)) return { ok: false, msg: "You're already in a cab" };
        if (!c.pos) return { ok: false, msg: "Can't work out where you are yet — try again in a second" };

        calls.set(c.id, { passengerId: c.id, name: c.name, pos: { ...c.pos }, at: now, driverId: null });
        return { ok: true, msg: "Cab called. Waiting for a driver." };
    }

    function cancelCab(c) {
        const call = calls.get(c.id);
        if (!call) return { ok: false, msg: "You haven't called a cab" };
        calls.delete(c.id);
        return { ok: true, msg: "Cab cancelled.", driverId: call.driverId };
    }

    function openCalls() {
        return [...calls.values()];
    }

    function listCalls() {
        const open = [...calls.values()].filter((call) => !call.driverId);
        if (open.length === 0) return "No cabs wanted right now.";
        return ["--- Calls waiting ---", ...open.map((call) => `${call.name} (id ${call.passengerId}) — /accept ${call.passengerId}`)].join("\n");
    }

    function accept(driver, passenger) {
        const ok = isDriver(driver);
        if (!ok.ok) return ok;
        if (!passenger) return { ok: false, msg: "No player with that id" };
        if (rides.has(driver.id)) return { ok: false, msg: "Finish your current fare first (/endfare)" };

        const call = calls.get(passenger.id);
        if (!call) return { ok: false, msg: `${passenger.name} isn't waiting on a cab` };
        if (call.driverId === driver.id) return { ok: false, msg: "You've already got this one" };
        if (call.driverId) return { ok: false, msg: "Another driver took that call" };

        call.driverId = driver.id;
        return { ok: true, msg: `You took ${passenger.name}'s call. Head over and /startfare ${passenger.id}` };
    }

    function startFare(driver, passenger) {
        const ok = isDriver(driver);
        if (!ok.ok) return ok;
        if (!passenger) return { ok: false, msg: "No player with that id" };
        if (rides.has(driver.id)) return { ok: false, msg: "You're already running a fare" };

        const call = calls.get(passenger.id);
        if (!call || call.driverId !== driver.id) return { ok: false, msg: `You haven't taken ${passenger.name}'s call` };
        if (!driver.pos || !passenger.pos || distance(driver.pos, passenger.pos) > PICKUP_RANGE) {
            return { ok: false, msg: `Get closer to ${passenger.name} before starting the meter` };
        }

        calls.delete(passenger.id);
        rides.set(driver.id, { passengerId: passenger.id, units: 0, lastPos: { ...driver.pos } });
        return { ok: true, msg: `Meter running for ${passenger.name}. Flag drop ${economy.money(FARE_BASE)}.` };
    }

    // Counted off the driver's position sweep, teleports ignored.
    function addDistance(id, pos) {
        const ride = rides.get(id);
        if (!ride || !pos) return;
        if (ride.lastPos) {
            const moved = distance(ride.lastPos, pos);
            if (moved <= MAX_TRUSTED_MOVE) ride.units += moved;
        }
        ride.lastPos = { ...pos };
    }

    // Who is the driver currently carrying? (so the caller can bill them)
    function passengerIdOf(driverId) {
        return rides.get(driverId)?.passengerId ?? null;
    }

    function meter(c) {
        const mine = rides.get(c.id) || rideWithPassenger(c.id)?.ride;
        if (!mine) return { ok: false, msg: "No fare running" };
        return { ok: true, msg: `Meter: ${Math.round(mine.units)} units driven — ${economy.money(fareFor(mine.units))}` };
    }

    function endFare(driver, passenger) {
        const ride = rides.get(driver.id);
        if (!ride) return { ok: false, msg: "No fare running" };

        const fare = fareFor(ride.units);
        rides.delete(driver.id);

        // The ride happened, so take what they have rather than wedging both players
        const paid = passenger ? Math.min(passenger.bank, fare) : 0;
        if (passenger) passenger.bank -= paid;
        driver.bank += paid;
        driver.gold += FARE_GOLD;

        const short = paid < fare ? ` (${economy.money(fare - paid)} short)` : "";
        return {
            ok: true,
            passengerId: ride.passengerId,
            msg: `Fare done: ${Math.round(ride.units)} units, ${economy.money(fare)}. +${economy.money(paid)}${short}, +${FARE_GOLD} gold`,
            passengerMsg: passenger
                ? `${driver.name} dropped you off. ${economy.money(paid)} from your bank${short}.`
                : null,
        };
    }

    // Unclaimed calls go stale. Returns the passengers to tell.
    function expire(now) {
        const gone = [];
        for (const [id, call] of calls) {
            if (!call.driverId && now - call.at >= CALL_EXPIRY_MIN * 60000) {
                calls.delete(id);
                gone.push(id);
            }
        }
        return gone;
    }

    // Someone logged off: tear down whatever they were part of.
    function dropPlayer(id) {
        const notify = [];
        const call = calls.get(id);
        if (call) {
            calls.delete(id);
            if (call.driverId) notify.push({ id: call.driverId, msg: `${call.name} logged off — that call is gone.` });
        }
        for (const [otherId, other] of calls) {
            if (other.driverId === id) {
                other.driverId = null; // back in the queue for someone else
                notify.push({ id: otherId, msg: "Your driver logged off. Still waiting for a cab." });
            }
        }
        const asDriver = rides.get(id);
        if (asDriver) {
            rides.delete(id);
            notify.push({ id: asDriver.passengerId, msg: "Your driver logged off. The fare is cancelled." });
        }
        const asPassenger = rideWithPassenger(id);
        if (asPassenger) {
            rides.delete(asPassenger.driverId);
            notify.push({ id: asPassenger.driverId, msg: "Your passenger logged off. The fare is cancelled." });
        }
        return notify;
    }

    return { callCab, cancelCab, listCalls, openCalls, accept, startFare, addDistance, meter, passengerIdOf, endFare, expire, dropPlayer };
}

module.exports = { FARE_BASE, FARE_PER_100, FARE_GOLD, PICKUP_RANGE, CALL_EXPIRY_MIN, fareFor, createDispatch };
