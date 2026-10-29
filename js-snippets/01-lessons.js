// ============================================================
// 01-lessons.js — the Lua lessons 3, 4 and 5, rewritten in JavaScript
// Run it:  node js-snippets/01-lessons.js
//
// Lua -> JS cheat sheet
//   local x = 1            ->  let x = 1          (const if it never changes)
//   { water = 2 }          ->  { water: 2 }       (= becomes :)
//   inv["grape blunt"]     ->  inv["grape blunt"] (same brackets!)
//   a .. b                 ->  a + b   or  `${a}${b}`
//   print(x)               ->  console.log(x)
//   if x then ... end      ->  if (x) { ... }
//   pairs(t)               ->  Object.entries(t)
// ============================================================

// ------------------------------------------------------------
// Lesson 3 — Tables (in JS: objects)
// A bag of key: value pairs. Multi-word names go in quotes.
// ------------------------------------------------------------
const inventory = {
    water: 2,
    sandwich: 1,
    phone: 1,
    glizzy: 1,
    machete: 1,
    bearspray: 1,
    "mythical black Chopper": 1,
};

// ------------------------------------------------------------
// "Print reads, functions act."
// Looking never uses anything — these lines change nothing.
// ------------------------------------------------------------
console.log(inventory.water);                           // 2
console.log("Water: " + inventory.water);               // Water: 2
console.log(`Chopper: ${inventory["mythical black Chopper"]}`); // multi-word = brackets

// ------------------------------------------------------------
// Lesson 4 — useItem: check first, then act, then report.
// The only line that consumes is the `- 1`.
// ------------------------------------------------------------
function useItem(inv, item) {
    if (inv[item] && inv[item] > 0) {
        inv[item] = inv[item] - 1;
        return "Used a " + item;
    } else {
        return "You don't have a " + item;
    }
}

console.log(useItem(inventory, "water"));       // Used a water
console.log(useItem(inventory, "water"));       // Used a water
console.log(useItem(inventory, "water"));       // You don't have a water  (it's 0 now)
console.log(useItem(inventory, "radio"));       // You don't have a radio  (never existed — guard still catches it)

// Same warning as Lua: wrapping useItem in console.log does NOT stop it
// from using the item. It subtracts inside itself before log ever sees it.

// ------------------------------------------------------------
// Adding without using — just write the number.
// `|| 0` covers an item you didn't have yet (undefined -> 0).
// ------------------------------------------------------------
function addItem(inv, item, count = 1) {
    inv[item] = (inv[item] || 0) + count;
    return `Got ${count}x ${item} (now ${inv[item]})`;
}

console.log(addItem(inventory, "water", 2));    // Got 2x water (now 2)
console.log(addItem(inventory, "medkit", 7));   // Got 7x medkit (now 7)

// ------------------------------------------------------------
// Lesson 5 — Loops: visit every item.
// Lua:  for item, count in pairs(inventory) do ... end
// JS:   for (const [item, count] of Object.entries(inventory)) { ... }
// Unlike Lua's pairs, JS keeps the order you wrote them in
// (for normal text keys).
// ------------------------------------------------------------
console.log("--- Inventory ---");
for (const [item, count] of Object.entries(inventory)) {
    console.log(item + ": " + count);
}

// Bonus: only show what you actually have (skip the zeros)
console.log("--- Carrying ---");
for (const [item, count] of Object.entries(inventory)) {
    if (count > 0) console.log(`${item} x${count}`);
}

// ------------------------------------------------------------
// The paycheck line from your notes, finished:
// Lua:  print("Cash after paycheck: $" .. cash)
// ------------------------------------------------------------
let cash = 500;
cash = cash + 250;
console.log("Cash after paycheck: $" + cash);   // Cash after paycheck: $750
