// map-detail-glizzys-2-go.js — parks the Glizzys-2-Go carts somewhere new on every load.
// Each cart lands on a random point along a road centerline below, weighted by
// road length, at least GAP apart and clear of construction and interchanges.
// Without this script the carts sit at the fixed spots in map-detail-glizzys-2-go.css.
//   line: [x1, y1, x2, y2]               a straight road, ends in % of the map
//   arc:  [cx, cy, rx, ry, fromDeg, toDeg] a ring or curve (0° = east, 90° = north)
(function () {
    const ASPECT = 5 / 4;   // map height / width
    const GAP = 7;
    const ROADS = [
        { line: [48.2, 15, 48.2, 76] },          // The Connector
        { line: [20, 40.8, 75, 40.8] },          // County Line Road
        { line: [33, 46.9, 64.06, 35.84] },      // The Backroads
        { line: [84.87, 33, 78.93, 60] },        // Backroads Highway
        { line: [83.16, 7, 76.64, 28] },         // Lakeshore Drive
        { line: [17, 11, 47, 14.8] },            // The 312 Skyway
        { line: [20.14, 6, 22.06, 28] },         // Ironline Expressway
        { line: [74, 14.17, 95, 19.63] },        // The Causeway
        { line: [20, 23.85, 54, 23.85] },        // Palisade Boulevard
        { line: [31, 61.64, 61, 64.16] },        // Red Clay Expressway
        { line: [7, 72.57, 31, 71.23] },         // Westside Run
        { line: [18, 73.25, 44, 74.35] },        // Peachline Road
        { line: [62, 78.83, 75.2, 77.53] },      // Highfield Park Drive, to the shore
        { line: [74.6, 77.6, 78.1, 81.2] },      // down onto the harbor quay
        { arc: [50, 81, 25.2, 12.35, 0, 360] },  // The Perimeter
        { arc: [23.5, 9, 7.05, 4.64, 0, 360] },  // Knot Loop
    ];
    const KEEP_CLEAR = [                              // [x, y, radius]
        [58, 72.5, 6],                           // the job station
        [46.0, 62.9, 6],            // job station, Red Clay Expressway, by the Connector
        [64.5, 70.9, 6],            // job station, the Perimeter, north-east
        [33.6, 74.4, 6],            // job station, 1017 downtown, west
        [53.5, 73, 6],              // job station, 1017 downtown, by the Connector's end
        [44, 73, 9],                             // under the 1017 label
        [56, 63.3, 7],                           // construction, Red Clay Expressway
        [82.4, 41, 6],                           // construction, Backroads Highway
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
