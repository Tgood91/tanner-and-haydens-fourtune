-- world/data.lua — GENERATED, do not edit by hand.
-- Regenerate from the JS modules so the two can never drift:
--   node tools/gen-world-data.js > world/data.lua
-- Source of truth: js-snippets/cities.js, places.js, spawns.js

-- FiveM has no require(): data.lua is listed in fxmanifest and sets this global.
-- The return keeps it loadable with dofile() for the test harness.
FourtuneWorldData = {
    borders = { chicago = 5500, geepee = 3000 },
    defaultCity = "atlanta",

    cities = {
        atlanta = { label = "Atlanta" },
        geepee = { label = "GeePee" },
        chicago = { label = "Chicago" },
    },

    releaseCity = {
        atlanta = "chicago",
        geepee = "atlanta",
        chicago = "geepee",
    },

    spawns = {
        atlanta = {
            { label = "Alder Street", pos = { x = -269.4, y = -955.3, z = 31.2 }, heading = 205 },
            { label = "Lantern Square", pos = { x = 195.2, y = -933.8, z = 30.7 }, heading = 144 },
            { label = "Delmar Pier", pos = { x = -1606.9, y = -1029.6, z = 13 }, heading = 50 },
        },
        geepee = {
            { label = "Harvestside", pos = { x = 1693, y = 4823, z = 42 }, heading = 95 },
            { label = "Dust Road", pos = { x = 1961, y = 3740, z = 32.3 }, heading = 300 },
        },
        chicago = {
            { label = "Chicago Main", pos = { x = -450, y = 6015, z = 33 }, heading = 315 },
            { label = "Palisade Boulevard", pos = { x = -125, y = 6380, z = 31.5 }, heading = 45 },
        },
    },

    zones = {
        { name = "The Knot", kind = "district", city = "chicago", center = { x = -430, y = 6020 }, radius = 140 },
        { name = "Midway", kind = "district", city = "chicago", center = { x = -250, y = 6190 }, radius = 170 },
        { name = "Northline", kind = "district", city = "chicago", center = { x = -110, y = 6400 }, radius = 190 },
        { name = "The Shoreline", kind = "district", city = "chicago", center = { x = -60, y = 6150 }, radius = 150 },
        { name = "Winterline Park", kind = "park", city = "chicago", center = { x = -190, y = 6230 }, radius = 55 },
        { name = "Harbor Green", kind = "park", city = "chicago", center = { x = -150, y = 6075 }, radius = 45 },
        { name = "Harvest Flats", kind = "district", city = "geepee", center = { x = 1850, y = 3720 }, radius = 260 },
        { name = "The Backroads", kind = "district", city = "geepee", center = { x = 1760, y = 4400 }, radius = 420 },
        { name = "Harvest Common", kind = "park", city = "geepee", center = { x = 1700, y = 4870 }, radius = 120 },
        { name = "Red Clay", kind = "district", city = "atlanta", center = { x = 230, y = -700 }, radius = 260 },
        { name = "Alder Heights", kind = "district", city = "atlanta", center = { x = -260, y = -950 }, radius = 220 },
        { name = "Southline", kind = "district", city = "atlanta", center = { x = 10, y = -1550 }, radius = 300 },
        { name = "The Westside", kind = "district", city = "atlanta", center = { x = -1100, y = -1100 }, radius = 480 },
        { name = "Peach Ridge Park", kind = "park", city = "atlanta", center = { x = -860, y = -890 }, radius = 130 },
        { name = "Groveland Park", kind = "park", city = "atlanta", center = { x = -120, y = -1690 }, radius = 110 },
    },

    roads = {
        { name = "Lakeshore Drive", city = "chicago", width = 28, points = {
            { x = -60, y = 5990 },
            { x = -75, y = 6180 },
            { x = -95, y = 6410 },
        } },
        { name = "Palisade Boulevard", city = "chicago", width = 26, points = {
            { x = -452, y = 6372 },
            { x = -230, y = 6378 },
            { x = -70, y = 6396 },
        } },
        { name = "Sheriff's Row", city = "chicago", width = 22, points = {
            { x = -452, y = 6008 },
            { x = -330, y = 6060 },
            { x = -248, y = 6180 },
        } },
        { name = "The Causeway", city = "chicago", width = 30, points = {
            { x = -245, y = 6330 },
            { x = -150, y = 6395 },
            { x = -70, y = 6404 },
        } },
        { name = "Backroads Highway", city = "geepee", width = 34, points = {
            { x = 1690, y = 4930 },
            { x = 1780, y = 4300 },
            { x = 1900, y = 3800 },
            { x = 2005, y = 3774 },
        } },
        { name = "Harvest Lane", city = "geepee", width = 22, points = {
            { x = 1839, y = 3672 },
            { x = 1960, y = 3740 },
        } },
        { name = "The Connector", city = "atlanta", width = 36, points = {
            { x = 290, y = -600 },
            { x = 60, y = -1100 },
            { x = 20, y = -1560 },
            { x = -70, y = -1755 },
        } },
        { name = "Peachline Road", city = "atlanta", width = 26, points = {
            { x = 195, y = -935 },
            { x = -270, y = -955 },
            { x = -530, y = -1205 },
        } },
        { name = "Groveland Street", city = "atlanta", width = 22, points = {
            { x = -70, y = -1760 },
            { x = 45, y = -1748 },
            { x = 180, y = -1700 },
        } },
        { name = "Westside Run", city = "atlanta", width = 30, points = {
            { x = -530, y = -1210 },
            { x = -1000, y = -1060 },
            { x = -1600, y = -1030 },
        } },
    },
}

return FourtuneWorldData
