/* SolarCity — core game state & simulation engine (framework-free). */

// Tiny deterministic PRNG (mulberry32) so the generated land plots are
// identical on every reload for a given zip.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// Generate a grid of land parcels around the zip center.
function generateParcels(config) {
  const rng = makeRng(seedFromString(config.zip));
  const parcels = [];
  const cols = 6;
  const rows = 5;
  // ~110m per parcel in latitude; longitude scaled by cos(lat).
  const dLat = 0.0011;
  const dLng = 0.0011 / Math.cos((config.center.lat * Math.PI) / 180);
  const startLat = config.center.lat + (rows / 2) * dLat;
  const startLng = config.center.lng - (cols / 2) * dLng;

  let id = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Skip a few cells to create "already developed / not for sale" gaps.
      if (rng() < 0.12) continue;
      const lat = startLat - r * dLat;
      const lng = startLng + c * dLng;
      const pad = dLat * 0.12;
      const padLng = dLng * 0.12;
      const bounds = [
        [lat - dLat + pad, lng + padLng],
        [lat - pad, lng + dLng - padLng],
      ];
      // Acreage roughly 0.25 - 1.2 acres.
      const acres = +(0.25 + rng() * 0.95).toFixed(2);
      // Sun quality 0.85 - 1.10 (shading, orientation).
      const sunQuality = +(0.85 + rng() * 0.25).toFixed(3);
      // Max panels scales with area (~one 400W panel per ~2.5 m^2 usable).
      const maxPanels = Math.round(acres * 320);
      // Price scales with area and sun quality.
      const price = Math.round(
        (6000 + acres * 22000 + (sunQuality - 0.85) * 40000) / 500
      ) * 500;

      parcels.push({
        id: "P" + id,
        index: id,
        bounds,
        center: [lat - dLat / 2, lng + dLng / 2],
        acres,
        sunQuality,
        maxPanels,
        price,
        owned: false,
        // installed gear: { panelTypeId: count }, batteries: { batteryTypeId: count }
        panels: {},
        batteries: {},
      });
      id++;
    }
  }
  return parcels;
}

class Game {
  constructor(config) {
    this.config = config;
    this.cash = config.startingCash;
    this.monthIndex = 0; // 0 = January of year 1
    this.year = 1;
    this.lifetimeKwh = 0;
    this.lifetimeRevenue = 0;
    this.lifetimeCo2Kg = 0;
    this.parcels = generateParcels(config);
    this.completedGoals = {};
    this.history = []; // [{label, kwh, revenue, net}]
    this.lastMonth = null; // summary of most recent advance
    this.selectedParcelId = null;
  }

  // ---- derived helpers ----
  ownedParcels() {
    return this.parcels.filter((p) => p.owned);
  }

  panelType(id) {
    return PANEL_TYPES.find((t) => t.id === id);
  }
  batteryType(id) {
    return BATTERY_TYPES.find((t) => t.id === id);
  }

  parcelPanelCount(p) {
    return Object.values(p.panels).reduce((a, b) => a + b, 0);
  }
  parcelInstalledSlots(p) {
    return this.parcelPanelCount(p);
  }

  totalPanels() {
    return this.ownedParcels().reduce((a, p) => a + this.parcelPanelCount(p), 0);
  }

  totalCapacityKw() {
    let w = 0;
    for (const p of this.ownedParcels()) {
      for (const [tid, n] of Object.entries(p.panels)) {
        const t = this.panelType(tid);
        if (t) w += t.wattage * n;
      }
    }
    return w / 1000;
  }

  totalBatteryKwh() {
    let kwh = 0;
    for (const p of this.ownedParcels()) {
      for (const [bid, n] of Object.entries(p.batteries)) {
        const b = this.batteryType(bid);
        if (b) kwh += b.capacityKwh * n;
      }
    }
    return kwh;
  }

  level() {
    const cap = this.totalCapacityKw();
    let cur = LEVELS[0];
    for (const l of LEVELS) if (cap >= l.capacityKw) cur = l;
    return cur;
  }

  nextLevel() {
    const cap = this.totalCapacityKw();
    return LEVELS.find((l) => l.capacityKw > cap) || null;
  }

  // Estimated production for a given month index (0-11) across all owned land.
  estimateMonthKwh(monthIdx) {
    const psh = this.config.peakSunHours[monthIdx];
    const days = this.config.daysInMonth[monthIdx];
    let kwh = 0;
    for (const p of this.ownedParcels()) {
      let parcelKw = 0;
      for (const [tid, n] of Object.entries(p.panels)) {
        const t = this.panelType(tid);
        if (t) parcelKw += (t.wattage * n) / 1000;
      }
      kwh += parcelKw * psh * days * this.config.performanceRatio * p.sunQuality;
    }
    return kwh;
  }

  // Average expected production for the *next* month (for UI preview).
  previewNextMonthKwh() {
    return this.estimateMonthKwh(this.monthIndex % 12);
  }

  // ---- actions ----
  buyParcel(id) {
    const p = this.parcels.find((x) => x.id === id);
    if (!p || p.owned) return { ok: false, msg: "Unavailable." };
    if (this.cash < p.price)
      return { ok: false, msg: "Not enough cash for this plot." };
    this.cash -= p.price;
    p.owned = true;
    return { ok: true, msg: `Purchased ${p.id} for ${money(p.price)}.` };
  }

  addPanels(parcelId, typeId, count) {
    const p = this.parcels.find((x) => x.id === parcelId);
    const t = this.panelType(typeId);
    if (!p || !p.owned || !t) return { ok: false, msg: "Unavailable." };
    if (t.unlockLevel > this.level().level)
      return { ok: false, msg: `${t.name} unlocks at level ${t.unlockLevel}.` };
    const free = p.maxPanels - this.parcelPanelCount(p);
    const n = Math.min(count, free);
    if (n <= 0) return { ok: false, msg: "This plot is full of panels." };
    const cost = n * t.cost;
    if (this.cash < cost)
      return { ok: false, msg: `Need ${money(cost)} for ${n} panels.` };
    this.cash -= cost;
    p.panels[typeId] = (p.panels[typeId] || 0) + n;
    return { ok: true, msg: `Installed ${n} × ${t.name} on ${p.id}.` };
  }

  addBattery(parcelId, typeId, count) {
    const p = this.parcels.find((x) => x.id === parcelId);
    const b = this.batteryType(typeId);
    if (!p || !p.owned || !b) return { ok: false, msg: "Unavailable." };
    if (b.unlockLevel > this.level().level)
      return { ok: false, msg: `${b.name} unlocks at level ${b.unlockLevel}.` };
    const cost = count * b.cost;
    if (this.cash < cost)
      return { ok: false, msg: `Need ${money(cost)} for that storage.` };
    this.cash -= cost;
    p.batteries[typeId] = (p.batteries[typeId] || 0) + count;
    return { ok: true, msg: `Installed ${count} × ${b.name} on ${p.id}.` };
  }

  // Advance one month: produce energy, earn revenue, pay upkeep, grant budget.
  advanceMonth() {
    const m = this.monthIndex % 12;
    const kwh = this.estimateMonthKwh(m);

    // Batteries let you capture more value: without storage a slice of midday
    // overproduction is curtailed. Storage raises the effective sell fraction.
    const capacityKw = this.totalCapacityKw();
    const storageKwh = this.totalBatteryKwh();
    let sellFraction = 0.85;
    if (capacityKw > 0) {
      const ratio = storageKwh / (capacityKw * 4); // ~4h of storage = full credit
      sellFraction = Math.min(1, 0.85 + 0.15 * Math.min(1, ratio));
    }

    const revenue = kwh * sellFraction * this.config.sellPricePerKwh;
    const upkeep = this.totalPanels() * this.config.maintenancePerPanelPerMonth;
    const budget = this.config.monthlyBudget;
    const net = revenue - upkeep + budget;

    this.cash += net;
    this.lifetimeKwh += kwh;
    this.lifetimeRevenue += revenue;
    this.lifetimeCo2Kg += kwh * this.config.co2KgPerKwh;

    const label = `${this.config.monthNames[m]} Y${this.year}`;
    this.history.push({ label, kwh, revenue, net });
    if (this.history.length > 24) this.history.shift();

    this.lastMonth = {
      label, kwh, revenue, upkeep, budget, net,
      sellFraction, storageKwh, capacityKw,
    };

    this.monthIndex++;
    if (this.monthIndex % 12 === 0) this.year++;

    const newlyCompleted = this.checkGoals();
    return { last: this.lastMonth, newlyCompleted };
  }

  checkGoals() {
    const newly = [];
    for (const goal of GOALS) {
      if (!this.completedGoals[goal.id] && goal.test(this)) {
        this.completedGoals[goal.id] = true;
        this.cash += goal.reward;
        newly.push(goal);
      }
    }
    return newly;
  }

  score() {
    return Math.round(
      this.lifetimeCo2Kg * 2 + this.lifetimeRevenue + this.totalCapacityKw() * 50
    );
  }
}

function money(n) {
  const neg = n < 0;
  const v = Math.abs(Math.round(n));
  return (neg ? "-$" : "$") + v.toLocaleString("en-US");
}
