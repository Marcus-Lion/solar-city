/* SolarCity — game configuration & static data.
 * All tunable balance values live here so the simulation stays data-driven.
 */

const CONFIG = {
  zip: "33763",
  cityName: "Clearwater, FL",
  // Map center for zip 33763 (Clearwater, Florida) — the real "On Top of the
  // World" community, where the parcel addresses in docs/buildings.csv live.
  center: { lat: 27.9992, lng: -82.7395 },
  zoom: 16,
  // Site latitude drives the optimal panel tilt (≈ latitude for max annual yield).
  latitude: 28.0,

  startingCash: 35000,
  // Monthly investment allowance ("budget") injected each month, on top of energy revenue.
  monthlyBudget: 3000,

  // Economics
  sellPricePerKwh: 0.12, // grid sells your energy / net-metering credit ($/kWh)
  maintenancePerPanelPerMonth: 1.5, // $/panel/month upkeep
  co2KgPerKwh: 0.42, // grid carbon intensity offset per kWh produced

  performanceRatio: 0.8, // system losses (inverter, wiring, soiling, temp)
  panelsPerAcre: 320, // usable panel density (~one 400W panel per ~2.5 m²)

  // Average daily peak-sun-hours by month for the Tampa Bay / Clearwater area.
  // Index 0 = January ... 11 = December.
  peakSunHours: [4.5, 5.2, 6.0, 6.6, 6.5, 5.8, 5.7, 5.6, 5.3, 5.2, 4.7, 4.3],

  monthNames: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ],
  daysInMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
};

// Solar panel catalog. wattage in watts (DC) per panel unit.
const PANEL_TYPES = [
  {
    id: "std",
    name: "Standard 400W",
    wattage: 400,
    cost: 250,
    yieldFactor: 1.0, // baseline energy per nameplate watt
    unlockLevel: 1,
    color: "#3b82f6",
    blurb: "Reliable monocrystalline workhorse.",
  },
  {
    id: "premium",
    name: "Premium 450W",
    wattage: 450,
    cost: 360,
    yieldFactor: 1.08, // better low-light & temperature behavior
    unlockLevel: 2,
    color: "#22c55e",
    blurb: "Higher efficiency, better low-light yield.",
  },
  {
    id: "bifacial",
    name: "Bifacial 500W",
    wattage: 500,
    cost: 520,
    yieldFactor: 1.18, // rear-side gain from reflected light
    unlockLevel: 3,
    color: "#a855f7",
    blurb: "Captures reflected light from both sides.",
  },
];

// Battery catalog. capacityKwh = usable storage.
const BATTERY_TYPES = [
  {
    id: "home",
    name: "Home Battery 10kWh",
    capacityKwh: 10,
    cost: 4000,
    unlockLevel: 1,
    color: "#f59e0b",
    blurb: "Stores excess daytime energy for the evening.",
  },
  {
    id: "mega",
    name: "Mega Pack 100kWh",
    capacityKwh: 100,
    cost: 34000,
    unlockLevel: 3,
    color: "#ef4444",
    blurb: "Utility-scale storage to smooth big arrays.",
  },
];

// Sheep (agrivoltaics): graze the grass under the panels, cutting maintenance,
// and grow the flock for monthly meat revenue.
const SHEEP = {
  cost: 220, // $ to buy one ewe
  acresPerSheep: 0.2, // carrying capacity: ~5 sheep/acre under rotational grazing
  monthlyGrowth: 0.05, // flock breeding rate per month (compounding)
  meatRevenuePerSheepPerMonth: 9, // $/sheep/month from meat & wool
  // Grazing offsets vegetation maintenance: a fully-stocked parcel removes this
  // fraction of its panels' upkeep (less mowing/landscaping).
  upkeepReductionPerPanel: 0.6,
  color: "#e2e8f0",
};

// Level thresholds keyed on total installed capacity in kW (DC).
// Reaching a level unlocks new gear and raises your prestige.
const LEVELS = [
  { level: 1, title: "Rooftop Rookie", capacityKw: 0 },
  { level: 2, title: "Array Apprentice", capacityKw: 25 },
  { level: 3, title: "Solar Strategist", capacityKw: 75 },
  { level: 4, title: "Grid Guru", capacityKw: 200 },
  { level: 5, title: "Sun Baron", capacityKw: 500 },
];

// One-time goals that award bonus cash and drive progression.
const GOALS = [
  { id: "first_parcel", name: "Buy your first plot of land", reward: 1000,
    test: (g) => g.ownedParcels().length >= 1 },
  { id: "first_panels", name: "Install 10 solar panels", reward: 1500,
    test: (g) => g.totalPanels() >= 10 },
  { id: "first_battery", name: "Install your first battery", reward: 2000,
    test: (g) => g.totalBatteryKwh() > 0 },
  { id: "cap_25", name: "Reach 25 kW of capacity", reward: 4000,
    test: (g) => g.totalCapacityKw() >= 25 },
  { id: "cap_100", name: "Reach 100 kW of capacity", reward: 12000,
    test: (g) => g.totalCapacityKw() >= 100 },
  { id: "mwh_10", name: "Produce 10 MWh of clean energy", reward: 6000,
    test: (g) => g.lifetimeKwh >= 10000 },
  { id: "land_baron", name: "Own 5 plots of land", reward: 8000,
    test: (g) => g.ownedParcels().length >= 5 },
  { id: "well_tuned", name: "Tune a parcel within 2\u00b0 of optimal tilt", reward: 2500,
    test: (g) => g.ownedParcels().some((p) => g.parcelPanelCount(p) > 0 && Math.abs(p.tilt - g.optimalAnnualTilt()) <= 2) },
  { id: "shepherd", name: "Raise a flock of 25 sheep", reward: 3000,
    test: (g) => g.totalSheep() >= 25 },
];

// Real-world building addresses for zip 33763 (source: county parcel data,
// docs/buildings.csv). Parcels are labeled with these instead of "P0", "P1".
const BUILDING_NAMES = [
  "2000 World Parkway Blvd",
  "2001 World Parkway Blvd",
  "2002 Australia Way",
  "2011 Australia Way",
  "2019 Utopian Dr.",
  "2020 World Parkway Blvd",
  "2020 Shangrila",
  "2021 Australia Way",
  "2021 Shangrila",
  "2022 Camelot",
  "2040 World Parkway Blvd",
  "2041 Australia Way",
  "2042 Australia Way",
  "2043 Denmark Street",
  "2070 World Parkway Blvd",
  "2071 Australia Way",
  "2072 Australia Way",
  "2073 Denmark Street",
  "2100 World Parkway Blvd",
  "2170 Americus",
  "2192 Swedish",
  "2200 World Parkway Blvd",
  "2209 Utopian",
  "2210 Utopian",
  "2220 Swedish",
  "2220 Spanish",
  "2221 Swedish",
  "2221 Norwegian",
  "2222 Americus",
  "2222 Norwegian",
  "2223 Philippine",
  "2226 Switzerland",
  "2228 Swedish",
  "2229 Americus",
  "2231 Utopian",
  "2253 Norwegian",
  "2254 Norwegian",
  "2255 Philippine",
  "2256 Philippine",
  "2256 Spanish",
  "2257 World Parkway Blvd",
  "2258 World Parkway Blvd",
  "2259 Costa Rican",
  "2260 Costa Rican",
  "2261 Swedish",
  "2262 Swedish",
  "2263 Americus",
  "2280 World Parkway Blvd",
  "2284 Philippine",
  "2284 Spanish",
  "2285 Israeli",
  "2285 Norwegian",
  "2286 Mexican",
  "2286 Norwegian",
  "2287 Philippine",
  "2291 Americus",
  "2292 Austrian",
  "2292 Costa Rican",
  "2293 Austrian",
  "2293 Swedish",
  "2294 Belgian",
  "2294 Swedish",
  "2295 Mexican",
  "2295 Belgian",
  "2295 Americus",
  "2296 Monaco",
  "2297 Monaco",
  "2298 Netherlands",
  "2298 Americus",
  "2310 Denmark Street",
  "2311 Brisbane",
  "2320 Brisbane",
  "2321 Ecuadorian",
  "2330 Ecuadorian",
  "2331 Finlandia",
  "2340 Grecian",
  "2341 Haitian",
  "2350 Haitian",
  "2351 Irish",
  "2358 Ecuadorian",
  "2359 Finlandia",
  "2360 World Parkway Blvd",
  "2360 Irish",
  "2361 Ecuadorian",
  "2361 Jamaican",
  "2362 Jamaican",
  "2363 Israeli",
  "2370 Jamaican",
  "2371 Israeli",
  "2378 Ecuadorian",
  "2379 Finlandia",
  "2380 World Parkway Blvd",
  "2381 Ecuadorian",
  "2383 Netherlands",
  "2384 Tahitian",
  "2385 Tahitian",
  "2386 Sumatran",
  "2391 Sumatran",
  "2400 Columbia",
  "2400 Franciscan",
  "2401 Ecuadorian",
  "2401 Franciscan",
  "2402 Ecuadorian",
  "2403 Finlandia",
  "2404 Florentine",
  "2405 Franciscan",
  "2410 Franciscan",
  "2416 World Parkway Blvd",
  "2417 Persian",
  "2426 Ecuadorian",
  "2426 Persian",
  "2427 Finlandia",
  "2427 Rhodesian",
  "2428 Columbia",
  "2429 Ecuadorian",
  "2430 Brazilia",
  "2430 Florentine",
  "2431 Canadian",
  "2431 Franciscan",
  "2433 Brazilia",
  "2434 Australia Way",
  "2435 Sumatran",
  "2436 Rhodesian",
  "2440 World Parkway Blvd",
  "2441 Persian",
  "2447 Ecuadorian",
  "2448 Columbia",
  "2449 Columbia",
  "2450 Canadian",
  "2451 Canadian",
  "2452 Brazilia",
  "2453 Brazilia",
  "2454 Australia Way",
  "2455 Finlandia",
  "2456 Ecuadorian",
  "2457 Ecuadorian",
  "2458 Columbia",
  "2458 Florentine",
  "2459 Columbia",
  "2459 Franciscan",
  "2460 Canadian",
  "2460 Franciscan",
  "2460 Persian",
  "2461 Canadian",
  "2461 Rhodesian",
  "2462 Brazilia",
  "2463 Brazilia",
  "2464 Australia Way",
  "2466 Ecuadorian",
  "2467 Finlandia",
  "2468 Florentine",
  "2469 Franciscan",
  "2470 Rhodesian",
  "2471 Sumatran",
];
