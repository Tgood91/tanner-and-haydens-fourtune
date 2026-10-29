// ============================================================
// environment.js — the clock and the weather, owned by the server
//
// GTA runs its own clock and weather per client, which means without
// this every player is in a different world: one sees a sunny
// afternoon while another drives through a thunderstorm at 3am. The
// server owns both here and tells every client what to show.
//
// The clock runs on the same tick as wages and hunger. One tick moves
// the world MINUTES_PER_TICK forward, so with the server ticking once
// a real minute a full day takes about 48 real minutes.
//
// Weather moves through a transition table rather than jumping at
// random: clear skies cloud over before it rains, and rain clears up
// before the sun comes back. Nobody gets a blizzard out of a blue sky.
//
// Other systems ask through isNight() and isWet() rather than reading
// the hour themselves, so the thresholds live in one place.
//
// Rates and the table are placeholders — a day that feels right is
// something you only find by playing one.
// ============================================================

const MINUTES_PER_TICK = 30;    // world minutes per server tick
const WEATHER_EVERY = 120;      // world minutes between weather rolls
const NIGHT_FROM = 21;          // 21:00
const NIGHT_UNTIL = 6;          // 06:00

// What each kind of sky can turn into next. Weights are relative.
const TRANSITIONS = {
    EXTRASUNNY: { EXTRASUNNY: 3, CLEAR: 4, CLOUDS: 2 },
    CLEAR:      { CLEAR: 3, EXTRASUNNY: 3, CLOUDS: 3, FOGGY: 1 },
    CLOUDS:     { CLOUDS: 3, CLEAR: 3, OVERCAST: 3, FOGGY: 1 },
    OVERCAST:   { OVERCAST: 2, CLOUDS: 3, RAIN: 3, FOGGY: 1 },
    RAIN:       { RAIN: 1, THUNDER: 1, CLEARING: 4 },
    THUNDER:    { THUNDER: 1, RAIN: 2, CLEARING: 3 },
    CLEARING:   { CLEARING: 1, CLOUDS: 3, CLEAR: 3 },
    FOGGY:      { FOGGY: 1, CLOUDS: 3, CLEAR: 2 },
};

const WET = new Set(["RAIN", "THUNDER"]);

const LABEL = {
    EXTRASUNNY: "blazing", CLEAR: "clear", CLOUDS: "cloudy", OVERCAST: "overcast",
    RAIN: "raining", THUNDER: "storming", CLEARING: "clearing up", FOGGY: "foggy",
};

function twoDigit(n) {
    return String(n).padStart(2, "0");
}

function clockOf(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    return { hour: h, minute: minutes % 60, text: `${twoDigit(h)}:${twoDigit(minutes % 60)}` };
}

function createEnvironment(rng = Math.random) {
    let minutes = 8 * 60;       // the server opens at 08:00
    let weather = "CLEAR";
    let sinceRoll = 0;
    let frozenTime = false;
    let frozenWeather = false;

    function isNight() {
        const h = clockOf(minutes).hour;
        return h >= NIGHT_FROM || h < NIGHT_UNTIL;
    }

    function isWet() {
        return WET.has(weather);
    }

    function state() {
        const c = clockOf(minutes);
        return { hour: c.hour, minute: c.minute, text: c.text, weather, night: isNight(), wet: isWet() };
    }

    function describe() {
        const c = clockOf(minutes);
        const parts = [`${c.text}, ${LABEL[weather] || weather.toLowerCase()}`];
        if (frozenTime) parts.push("(clock held)");
        if (frozenWeather) parts.push("(weather held)");
        return parts.join(" ");
    }

    function roll() {
        const options = TRANSITIONS[weather] || TRANSITIONS.CLEAR;
        const total = Object.values(options).reduce((a, b) => a + b, 0);
        let pick = rng() * total;
        for (const [next, weight] of Object.entries(options)) {
            pick -= weight;
            if (pick <= 0) return next;
        }
        return weather;
    }

    // Returns what changed, so game.js can tell people and sync clients.
    function advance(ticks = 1) {
        const before = { night: isNight(), weather };
        const changed = { time: false, weather: false, nightfall: false, daybreak: false };

        if (!frozenTime) {
            minutes = (minutes + MINUTES_PER_TICK * ticks) % 1440;
            changed.time = true;
        }

        if (!frozenWeather) {
            sinceRoll += MINUTES_PER_TICK * ticks;
            while (sinceRoll >= WEATHER_EVERY) {
                sinceRoll -= WEATHER_EVERY;
                weather = roll();
            }
            changed.weather = weather !== before.weather;
        }

        const nightNow = isNight();
        changed.nightfall = nightNow && !before.night;
        changed.daybreak = !nightNow && before.night;
        return changed;
    }

    // ---- console controls ----
    function setTime(hour, minute = 0) {
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, msg: "Hour is 0 to 23" };
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) return { ok: false, msg: "Minute is 0 to 59" };
        minutes = hour * 60 + minute;
        return { ok: true, msg: `Clock set to ${clockOf(minutes).text}` };
    }

    function setWeather(kind) {
        const want = String(kind || "").toUpperCase();
        if (!TRANSITIONS[want]) {
            return { ok: false, msg: `Unknown sky. Try: ${Object.keys(TRANSITIONS).join(", ")}` };
        }
        weather = want;
        sinceRoll = 0;
        return { ok: true, msg: `Weather set to ${LABEL[want]}` };
    }

    function freeze(what, on) {
        if (what === "time") frozenTime = on;
        else if (what === "weather") frozenWeather = on;
        else return { ok: false, msg: "Freeze time or weather" };
        return { ok: true, msg: `${what} ${on ? "held" : "running"}` };
    }

    function exportAll() {
        return { minutes, weather, sinceRoll, frozenTime, frozenWeather };
    }
    function importAll(saved) {
        if (!saved) return;
        minutes = saved.minutes ?? minutes;
        weather = TRANSITIONS[saved.weather] ? saved.weather : weather;
        sinceRoll = saved.sinceRoll ?? 0;
        frozenTime = !!saved.frozenTime;
        frozenWeather = !!saved.frozenWeather;
    }

    return { state, describe, advance, isNight, isWet, setTime, setWeather, freeze, exportAll, importAll };
}

module.exports = {
    MINUTES_PER_TICK, WEATHER_EVERY, NIGHT_FROM, NIGHT_UNTIL, TRANSITIONS, WET, LABEL,
    clockOf, createEnvironment,
};
