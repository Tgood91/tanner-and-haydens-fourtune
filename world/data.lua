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
        { name = "Lakeshore Drive", city = "chicago", kind = "highway", width = 30, points = {
            { x = -60, y = 5990 },
            { x = -75, y = 6180 },
            { x = -93, y = 6400 },
        } },
        { name = "The 312 Skyway", city = "chicago", kind = "highway", width = 34, points = {
            { x = -496, y = 6022 },
            { x = -360, y = 6180 },
            { x = -180, y = 6330 },
            { x = -70, y = 6404 },
        } },
        { name = "Ironline Expressway", city = "chicago", kind = "highway", width = 32, points = {
            { x = -490, y = 5962 },
            { x = -510, y = 6160 },
            { x = -480, y = 6420 },
            { x = -416, y = 6489 },
        } },
        { name = "Palisade Boulevard", city = "chicago", kind = "arterial", width = 26, points = {
            { x = -485, y = 6376 },
            { x = -230, y = 6378 },
            { x = -71, y = 6404 },
        } },
        { name = "Sheriff's Row", city = "chicago", kind = "arterial", width = 22, points = {
            { x = -447, y = 6010 },
            { x = -330, y = 6060 },
            { x = -249, y = 6174 },
        } },
        { name = "The Causeway", city = "chicago", kind = "arterial", width = 30, points = {
            { x = -247, y = 6338 },
            { x = -150, y = 6395 },
            { x = -70, y = 6396 },
        } },
        { name = "Midway Avenue", city = "chicago", kind = "arterial", width = 26, points = {
            { x = -412, y = 6195 },
            { x = -300, y = 6178 },
            { x = -180, y = 6168 },
            { x = -75, y = 6178 },
        } },
        { name = "Winterline Parkway", city = "chicago", kind = "arterial", width = 22, points = {
            { x = -252, y = 6272 },
            { x = -190, y = 6292 },
            { x = -128, y = 6266 },
            { x = -116, y = 6174 },
        } },
        { name = "Clayworks Boulevard", city = "chicago", kind = "arterial", width = 26, points = {
            { x = -493, y = 6307 },
            { x = -330, y = 6320 },
            { x = -233, y = 6346 },
        } },
        { name = "North Shore Avenue", city = "chicago", kind = "arterial", width = 22, points = {
            { x = -196, y = 6482 },
            { x = -150, y = 6502 },
            { x = -53, y = 6416 },
        } },
        { name = "Knot Loop", city = "chicago", kind = "arterial", width = 20, points = {
            { x = -490, y = 5963 },
            { x = -372, y = 5950 },
            { x = -348, y = 6062 },
            { x = -468, y = 6076 },
            { x = -490, y = 5963 },
        } },
        { name = "Harbor Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -142, y = 6075 },
            { x = -150, y = 6072 },
            { x = -69, y = 6099 },
        } },
        { name = "Winter Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -293, y = 6115 },
            { x = -290, y = 6240 },
            { x = -272, y = 6333 },
        } },
        { name = "Fenwick Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -417, y = 6117 },
            { x = -330, y = 6128 },
            { x = -267, y = 6152 },
        } },
        { name = "Mill Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -383, y = 6212 },
            { x = -287, y = 6260 },
        } },
        { name = "Bellmont Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -416, y = 6205 },
            { x = -392, y = 6212 },
            { x = -318, y = 6215 },
        } },
        { name = "Ketterling Avenue", city = "chicago", kind = "street", width = 16, points = {
            { x = -202, y = 6382 },
            { x = -185, y = 6488 },
        } },
        { name = "Hoyt Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -351, y = 6377 },
            { x = -269, y = 6377 },
        } },
        { name = "Granary Row", city = "chicago", kind = "street", width = 16, points = {
            { x = -454, y = 6448 },
            { x = -390, y = 6502 },
            { x = -194, y = 6511 },
        } },
        { name = "Dock Street", city = "chicago", kind = "street", width = 16, points = {
            { x = -150, y = 6072 },
            { x = -118, y = 6082 },
            { x = -115, y = 6174 },
        } },
        { name = "Shoreline Lane", city = "chicago", kind = "street", width = 16, points = {
            { x = -68, y = 6094 },
            { x = -24, y = 6212 },
            { x = -85, y = 6298 },
        } },
        { name = "Tannery Alley", city = "chicago", kind = "backroad", width = 11, points = {
            { x = -444, y = 6003 },
            { x = -416, y = 6017 },
        } },
        { name = "Coal Chute Lane", city = "chicago", kind = "backroad", width = 11, points = {
            { x = -506, y = 6120 },
            { x = -510, y = 6155 },
        } },
        { name = "Old Pier Road", city = "chicago", kind = "backroad", width = 11, points = {
            { x = -46, y = 5992 },
            { x = -47, y = 5995 },
        } },
        { name = "Dunes Track", city = "chicago", kind = "backroad", width = 11, points = {
            { x = -70, y = 6396 },
            { x = 2, y = 6480 },
            { x = 22, y = 6562 },
        } },
        { name = "Backroads Highway", city = "geepee", kind = "highway", width = 34, points = {
            { x = 1690, y = 4930 },
            { x = 1780, y = 4300 },
            { x = 1900, y = 3800 },
            { x = 1960, y = 3740 },
        } },
        { name = "County Line Road", city = "geepee", kind = "arterial", width = 26, points = {
            { x = 1500, y = 4700 },
            { x = 1700, y = 4762 },
            { x = 1900, y = 4802 },
        } },
        { name = "Grain Elevator Road", city = "geepee", kind = "arterial", width = 22, points = {
            { x = 1615, y = 4538 },
            { x = 1700, y = 4482 },
            { x = 1758, y = 4453 },
        } },
        { name = "Harvest Flats Road", city = "geepee", kind = "arterial", width = 26, points = {
            { x = 1620, y = 3840 },
            { x = 1760, y = 3880 },
            { x = 1879, y = 3887 },
        } },
        { name = "Harvest Lane", city = "geepee", kind = "street", width = 22, points = {
            { x = 1877, y = 3693 },
            { x = 1944, y = 3756 },
        } },
        { name = "Thresher Lane", city = "geepee", kind = "street", width = 16, points = {
            { x = 1912, y = 3674 },
            { x = 1960, y = 3740 },
        } },
        { name = "Silo Track", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1700, y = 4200 },
            { x = 1762, y = 4122 },
            { x = 1839, y = 4054 },
        } },
        { name = "Dust Road", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1550, y = 4352 },
            { x = 1652, y = 4302 },
        } },
        { name = "Old Mill Track", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1430, y = 4600 },
            { x = 1560, y = 4560 },
            { x = 1655, y = 4490 },
        } },
        { name = "Creekbed Lane", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1840, y = 4640 },
            { x = 1960, y = 4540 },
            { x = 2050, y = 4420 },
        } },
        { name = "Hollow Road", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1500, y = 4100 },
            { x = 1620, y = 4060 },
            { x = 1740, y = 4000 },
        } },
        { name = "Fence Line Track", city = "geepee", kind = "backroad", width = 11, points = {
            { x = 1808, y = 4183 },
            { x = 2000, y = 4120 },
            { x = 2080, y = 3990 },
        } },
        { name = "The Connector", city = "atlanta", kind = "highway", width = 36, points = {
            { x = 281, y = -620 },
            { x = 60, y = -1100 },
            { x = 20, y = -1560 },
            { x = -69, y = -1755 },
        } },
        { name = "The Perimeter", city = "atlanta", kind = "highway", width = 34, points = {
            { x = 348, y = -536 },
            { x = 420, y = -900 },
            { x = 300, y = -1400 },
            { x = 0, y = -1800 },
            { x = -500, y = -1700 },
            { x = -800, y = -1300 },
            { x = -700, y = -800 },
            { x = -300, y = -520 },
            { x = 348, y = -536 },
        } },
        { name = "Westside Run", city = "atlanta", kind = "highway", width = 30, points = {
            { x = -528, y = -1207 },
            { x = -1000, y = -1060 },
            { x = -1600, y = -1030 },
        } },
        { name = "Red Clay Expressway", city = "atlanta", kind = "highway", width = 30, points = {
            { x = 429, y = -634 },
            { x = 250, y = -762 },
            { x = 60, y = -862 },
            { x = -179, y = -946 },
        } },
        { name = "Peachline Road", city = "atlanta", kind = "arterial", width = 26, points = {
            { x = 154, y = -917 },
            { x = -270, y = -955 },
            { x = -530, y = -1205 },
        } },
        { name = "Groveland Street", city = "atlanta", kind = "arterial", width = 22, points = {
            { x = -67, y = -1756 },
            { x = 45, y = -1748 },
            { x = 113, y = -1650 },
        } },
        { name = "Alder Avenue", city = "atlanta", kind = "arterial", width = 26, points = {
            { x = -368, y = -887 },
            { x = -250, y = -932 },
            { x = -122, y = -940 },
        } },
        { name = "Southline Boulevard", city = "atlanta", kind = "arterial", width = 26, points = {
            { x = -200, y = -1502 },
            { x = 0, y = -1522 },
            { x = 186, y = -1552 },
        } },
        { name = "Clay Street", city = "atlanta", kind = "arterial", width = 22, points = {
            { x = 301, y = -630 },
            { x = 252, y = -762 },
            { x = 155, y = -915 },
        } },
        { name = "Ridgeview Drive", city = "atlanta", kind = "arterial", width = 26, points = {
            { x = -918, y = -868 },
            { x = -760, y = -882 },
            { x = -620, y = -962 },
        } },
        { name = "Mill Creek Road", city = "atlanta", kind = "arterial", width = 22, points = {
            { x = -1300, y = -1152 },
            { x = -1050, y = -1102 },
            { x = -812, y = -1120 },
        } },
        { name = "Sweetwater Avenue", city = "atlanta", kind = "arterial", width = 22, points = {
            { x = -56, y = -1730 },
            { x = -62, y = -1620 },
            { x = -22, y = -1520 },
        } },
        { name = "Pecan Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = 149, y = -684 },
            { x = 150, y = -760 },
            { x = 179, y = -867 },
        } },
        { name = "Brickyard Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = 334, y = -705 },
            { x = 240, y = -690 },
            { x = 150, y = -683 },
        } },
        { name = "Stovall Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = -332, y = -1015 },
            { x = -220, y = -1060 },
            { x = -130, y = -1082 },
        } },
        { name = "Hollis Avenue", city = "atlanta", kind = "street", width = 16, points = {
            { x = -348, y = -878 },
            { x = -340, y = -950 },
            { x = -315, y = -1025 },
        } },
        { name = "Fairline Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = -140, y = -1402 },
            { x = -40, y = -1422 },
            { x = 31, y = -1439 },
        } },
        { name = "Cotton Row", city = "atlanta", kind = "street", width = 16, points = {
            { x = -222, y = -1620 },
            { x = -120, y = -1602 },
            { x = -10, y = -1625 },
        } },
        { name = "Bellwood Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = -965, y = -1108 },
            { x = -960, y = -980 },
            { x = -905, y = -864 },
        } },
        { name = "Terrace Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = -1243, y = -1048 },
            { x = -1120, y = -940 },
            { x = -942, y = -932 },
        } },
        { name = "Quarry Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = 70, y = -1707 },
            { x = 110, y = -1620 },
            { x = 139, y = -1544 },
        } },
        { name = "Primrose Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = 262, y = -1180 },
            { x = 262, y = -1300 },
        } },
        { name = "Crystal Lake Drive", city = "atlanta", kind = "street", width = 16, points = {
            { x = 120, y = -1305 },
            { x = 262, y = -1300 },
        } },
        { name = "Dunwood Street", city = "atlanta", kind = "street", width = 16, points = {
            { x = -620, y = -1320 },
            { x = -520, y = -1380 },
            { x = -420, y = -1420 },
        } },
        { name = "Kudzu Lane", city = "atlanta", kind = "backroad", width = 11, points = {
            { x = -678, y = -1463 },
            { x = -620, y = -1540 },
            { x = -572, y = -1604 },
        } },
        { name = "Red Clay Track", city = "atlanta", kind = "backroad", width = 11, points = {
            { x = 299, y = -502 },
            { x = 420, y = -560 },
            { x = 432, y = -643 },
        } },
        { name = "Pumphouse Road", city = "atlanta", kind = "backroad", width = 11, points = {
            { x = -1400, y = -1240 },
            { x = -1300, y = -1300 },
            { x = -1200, y = -1330 },
        } },
        { name = "Switchyard Lane", city = "atlanta", kind = "backroad", width = 11, points = {
            { x = 200, y = -1240 },
            { x = 260, y = -1300 },
            { x = 305, y = -1381 },
        } },
    },
}

return FourtuneWorldData
