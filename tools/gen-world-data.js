const B = '/home/user/tanner-and-haydens-fourtune/js-snippets/';
const cities = require(B + 'cities.js'), places = require(B + 'places.js'), spawns = require(B + 'spawns.js');
const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const v = (p) => `{ x = ${p.x}, y = ${p.y}${p.z !== undefined ? `, z = ${p.z}` : ''} }`;
const L = [];
L.push('-- world/data.lua — GENERATED, do not edit by hand.');
L.push('-- Regenerate from the JS modules so the two can never drift:');
L.push('--   node tools/gen-world-data.js > world/data.lua');
L.push('-- Source of truth: js-snippets/cities.js, places.js, spawns.js');
L.push('');
L.push('-- FiveM has no require(): data.lua is listed in fxmanifest and sets this global.');
L.push('-- The return keeps it loadable with dofile() for the test harness.');
L.push('FourtuneWorldData = {');
L.push('    borders = { chicago = ' + cities.CHICAGO_STARTS_AT_Y + ', geepee = ' + cities.GEEPEE_STARTS_AT_Y + ' },');
L.push('    defaultCity = ' + q(spawns.DEFAULT_CITY) + ',');
L.push('');
L.push('    cities = {');
for (const [k, c] of Object.entries(cities.CITIES)) L.push(`        ${k} = { label = ${q(c.label)} },`);
L.push('    },');
L.push('');
L.push('    releaseCity = {');
for (const [from, to] of Object.entries(spawns.RELEASE_CITY)) L.push(`        ${from} = ${q(to)},`);
L.push('    },');
L.push('');
L.push('    spawns = {');
for (const [city, list] of Object.entries(spawns.SPAWNS)) {
  L.push(`        ${city} = {`);
  for (const s of list) L.push(`            { label = ${q(s.label)}, pos = ${v(s.pos)}, heading = ${s.heading} },`);
  L.push('        },');
}
L.push('    },');
L.push('');
L.push('    zones = {');
for (const z of places.ZONES) L.push(`        { name = ${q(z.name)}, kind = ${q(z.kind)}, city = ${q(z.city)}, center = ${v(z.center)}, radius = ${z.radius} },`);
L.push('    },');
L.push('');
L.push('    roads = {');
for (const r of places.ROADS) {
  L.push(`        { name = ${q(r.name)}, code = ${q(r.code)}, city = ${q(r.city)}, kind = ${q(r.kind)}, width = ${r.width}, points = {`);
  for (const p of r.points) L.push(`            ${v(p)},`);
  L.push('        } },');
}
L.push('    },');
L.push('}');
L.push('');
L.push('return FourtuneWorldData');
console.log(L.join('\n'));
