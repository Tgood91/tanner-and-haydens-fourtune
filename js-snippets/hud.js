// ============================================================
// hud.js — what the overlay shows
//
// A lot of state has built up that a player simply cannot see: what
// they're carrying, how hungry they are, whose turf they're standing
// on, how much fuel is left. Until now the only way to find out was to
// type a command and read chat.
//
// This file does no drawing. It builds the payload the NUI overlay
// renders, which keeps the decisions — what counts as low, what counts
// as a warning — here, where they can be tested, instead of buried in
// a browser script.
//
// The server pushes this every HUD_EVERY_MS. Nothing here is trusted
// from the client; it is all read off the character the server owns.
// ============================================================

const economy = require("./economy");
const jobs = require("./jobs");
const fuel = require("./fuel");
const places = require("./places");
const cities = require("./cities");

const CITY_CODES = { chicago: "312", atlanta: "1017", geepee: "770" };
const CITY_LABELS = { chicago: "CHI", atlanta: "ATL", geepee: "GP" };

const HUD_EVERY_MS = 2000;
const LOW = 25;        // under this a bar reads as low
const CRITICAL = 10;   // under this it reads as urgent

function level(value) {
    if (value <= CRITICAL) return "critical";
    if (value <= LOW) return "low";
    return "ok";
}

// Short, readable flags for the things that stop you doing anything
function statusOf(c) {
    const flags = [];
    if (c.downed) flags.push({ text: "DOWN", tone: "critical" });
    if (c.cuffed) flags.push({ text: "CUFFED", tone: "critical" });
    if (c.jailMinutes > 0) flags.push({ text: `JAIL ${c.jailMinutes}m`, tone: "critical" });
    if (!c.downed && !c.cuffed && !(c.jailMinutes > 0) && c.onDuty) {
        flags.push({ text: "ON DUTY", tone: "ok" });
    }
    return flags;
}

// world  = { text, weather, night } from environment.state()
// crew   = { tag, turf } or null
// car    = the world vehicle they're in, or null
function build(c, { world, crew, car } = {}) {
    const job = jobs.JOBS[c.job.name];
    const grade = job.grades[c.job.grade];

    const payload = {
        health: { value: Math.round(c.health), level: level(c.health) },
        hunger: { value: Math.round(c.hunger), level: level(c.hunger) },
        thirst: { value: Math.round(c.thirst), level: level(c.thirst) },

        cash: economy.money(c.cash),
        bank: economy.money(c.bank),
        gold: c.gold,

        job: c.job.name === "unemployed" ? job.label : `${job.label} · ${grade.label}`,
        status: statusOf(c),

        place: places.describe(c.pos),
        city: (c.pos && cities.cityAt(c.pos)) || "atlanta",
        cityCode: CITY_CODES[(c.pos && cities.cityAt(c.pos))] || "1017",
        cityLabel: CITY_LABELS[(c.pos && cities.cityAt(c.pos))] || "ATL",
        time: world ? world.text : null,
        weather: world ? world.weather.toLowerCase() : null,
        night: world ? world.night : false,

        crew: crew ? { tag: crew.tag, turf: crew.turf } : null,
        vehicle: null,
    };

    if (car) {
        const tank = fuel.tankFor(car.model);
        const litres = Math.round(car.car.fuel);
        payload.vehicle = {
            plate: car.plate,
            fuel: { value: litres, tank, percent: Math.round((car.car.fuel / tank) * 100), level: level((car.car.fuel / tank) * 100) },
            engine: Math.round((car.car.engine / fuel.MAX_HEALTH) * 100),
        };
    }

    return payload;
}

module.exports = { HUD_EVERY_MS, LOW, CRITICAL, level, statusOf, build };
