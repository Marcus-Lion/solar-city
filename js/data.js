/* SolarCity — game configuration & static data.
 * All tunable balance values live here so the simulation stays data-driven.
 */

const CONFIG = {
  zip: "33763",
  cityName: "Clearwater, FL",
  // Map center for zip 33763 (Clearwater, Florida).
  center: { lat: 27.9756, lng: -82.729 },
  zoom: 16,

  startingCash: 35000,
  // Monthly investment allowance ("budget") injected each month, on top of energy revenue.
  monthlyBudget: 3000,

  // Economics
  sellPricePerKwh: 0.12, // grid sells your energy / net-metering credit ($/kWh)
  maintenancePerPanelPerMonth: 1.5, // $/panel/month upkeep
  co2KgPerKwh: 0.42, // grid carbon intensity offset per kWh produced

  performanceRatio: 0.8, // system losses (inverter, wiring, soiling, temp)

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
    unlockLevel: 1,
    color: "#3b82f6",
    blurb: "Reliable monocrystalline workhorse.",
  },
  {
    id: "premium",
    name: "Premium 450W",
    wattage: 450,
    cost: 360,
    unlockLevel: 2,
    color: "#22c55e",
    blurb: "Higher efficiency, better low-light yield.",
  },
  {
    id: "bifacial",
    name: "Bifacial 500W",
    wattage: 500,
    cost: 520,
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
];
