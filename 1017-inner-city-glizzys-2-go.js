// 1017-inner-city-glizzys-2-go.js — parks the Glizzys-2-Go carts somewhere new on every load.
// Each cart lands on a random point along a road centerline below, weighted by
// road length, at least GAP apart and clear of construction and interchanges.
// Without this script the carts sit at the fixed spots in 1017-inner-city-glizzys-2-go.css.
//   line: [x1, y1, x2, y2]               a straight road, ends in % of the map
//   arc:  [cx, cy, rx, ry, fromDeg, toDeg] a ring or curve (0° = east, 90° = north)
(function () {
    const ASPECT = 5 / 6;   // map height / width
    const GAP = 8;
    const ROADS = [
        { line: [50, 3, 50, 90] },                    // The Connector
        { arc: [50, 44, 40.4, 34.25, 0, 360] },       // The Perimeter
        { arc: [48, 59.5, 33.5, 18.9, 0, 360] },      // The Inner Loop
        { arc: [49.5, 11.5, 16.95, 29.85, 180, 270] }, // The Flyover
        { line: [38, 20.4, 60, 20.4] },               // north towers crosstown
        { line: [36, 60.4, 60, 60.4] },               // south towers crosstown
        { line: [36, 67.4, 60, 67.4] },               // south towers crosstown
    ];
    const KEEP_CLEAR = [                              // [x, y, radius]
        [66, 71, 7],                                  // the job station
        [45, 55.5, 6],                                // the job station, south towers
        [79.5, 77.5, 6],                              // the dockhand station
        [50, 30, 6],                                  // construction, the Connector
        [14.5, 58, 9],                                // construction, Perimeter west arc
        [50, 40.8, 6],                                // the central interchange
        [50, 78.7, 5],                                // the south stack
    ];

    function at(road, t) {                    // t: 0..1 along the road
        if (road.line) {
            const [x1, y1, x2, y2] = road.line;
            return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        }
        const [cx, cy, rx, ry, from, to] = road.arc;
        const a = ((from + (to - from) * t) * Math.PI) / 180;
        return [cx + rx * Math.cos(a), cy - ry * Math.sin(a)];
    }
    // distance in map-width %, so height % is scaled by the map's shape
    const dist = (p, q) => Math.hypot(p[0] - q[0], (p[1] - q[1]) * ASPECT);
    function length(road) {
        let len = 0;
        for (let i = 0; i < 24; i++) len += dist(at(road, i / 24), at(road, (i + 1) / 24));
        return len;
    }

    function place() {
        const lengths = ROADS.map(length);
        const total = lengths.reduce((a, b) => a + b, 0);
        const taken = [];
        for (const cart of document.querySelectorAll(".map .glizzys-2-go")) {
            for (let tries = 0; tries < 300; tries++) {
                let pick = Math.random() * total, i = 0;   // longer roads get more carts
                while (pick > lengths[i]) pick -= lengths[i++];
                const p = at(ROADS[i], 0.05 + 0.9 * Math.random());  // not right at a road's end
                if (KEEP_CLEAR.some(([x, y, r]) => dist(p, [x, y]) < r)) continue;
                if (taken.some((q) => dist(p, q) < GAP)) continue;
                taken.push(p);
                cart.style.left = p[0] + "%";
                cart.style.top = p[1] + "%";
                cart.style.transform = "translate(-50%, -50%)";   // centered on the road
                break;
            }   // no spot found in 300 tries: the cart keeps its CSS spot
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place);
    else place();
})();
