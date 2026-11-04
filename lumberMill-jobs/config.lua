-- config.lua — the same spots as js-snippets/lumbermill.js (a test checks they match).
-- World coordinates on the island's West Woods.
LUMBER = {
    yardLabel = 'Hollow Creek Lumber Yard',
    saw    = { x = -6960.0, y = -6650.0, z = 10.7 },   -- mill shed, east door: /mill
    office = { x = -6894.0, y = -6564.0, z = 10.7 },   -- yard office: /sellplanks
    -- the Copper Hills felling spots: /fell
    trees = {
        { x = -7780.0, y = -7400.0, z = 30.7 }, { x = -7700.0, y = -7570.0, z = 46.0 },
        { x = -7600.0, y = -7350.0, z = 39.5 }, { x = -7500.0, y = -7600.0, z = 45.9 },
        { x = -7410.0, y = -7420.0, z = 54.4 }, { x = -7340.0, y = -7520.0, z = 39.7 },
        { x = -7690.0, y = -7450.0, z = 64.9 }, { x = -7450.0, y = -7310.0, z = 29.4 },
    },
    loggingCentre = { x = -7560.0, y = -7460.0, z = 40.0 },
    drawRange = 40.0,     -- metres: markers this close are drawn
    useRange = 4.5,       -- metres: close enough to press E (the server allows 5)
}
