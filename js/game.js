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

// Build parcels from real building plots (BUILDING_PLOTS) when available for
// this zip, otherwise fall back to the synthetic grid. Real plots are placed at
// their actual lat/lng and sized from each building's unit count.
function generateParcels(config) {
  // Live mode starts empty; the map streams real parcels for the viewport.
  if (config.liveParcels && config.liveParcels.enabled) {
    return [];
  }
  if (
    typeof BUILDING_PLOTS !== "undefined" &&
    BUILDING_PLOTS.length > 0 &&
    config.useRealPlots
  ) {
    return generateRealParcels(config);
  }
  return generateGridParcels(config);
}

// Title-case a county SITE_ADDRESS like "2257 WORLD PARKWAY BLVD W".
function titleCaseAddress(s) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(N|S|E|W|Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase());
}

// Convert an Esri parcel feature (geometry in WGS84 rings of [lng, lat]) into a
// game parcel. Attributes (acreage, address) come from the county; sun quality
// and price jitter are seeded from the parcel id so the world is deterministic.
function parcelFromFeature(feature, config) {
  const a = feature.attributes || {};
  const id = String(a.PARCELID || a.OBJECTID);
  const ring = feature.geometry && feature.geometry.rings && feature.geometry.rings[0];
  if (!ring || ring.length < 3) return null;

  let sumLat = 0;
  let sumLng = 0;
  const polygon = ring.map(([lng, lat]) => {
    sumLat += lat;
    sumLng += lng;
    return [lat, lng];
  });
  const center = [sumLat / ring.length, sumLng / ring.length];

  const acres = +(a.Acres && a.Acres > 0 ? a.Acres : 0.2).toFixed(2);
  const rng = makeRng(seedFromString(config.zip + "|" + id));
  const sunQuality = +(0.85 + rng() * 0.25).toFixed(3);
  // Cap panel capacity so a huge land parcel doesn't dominate the game.
  const maxPanels = Math.min(
    2000,
    Math.max(4, Math.round(acres * config.panelsPerAcre))
  );
  const price =
    Math.round(
      (6000 + acres * 22000 + (sunQuality - 0.85) * 40000) / 500
    ) * 500;

  const addr = (a.SITE_ADDRESS || "").trim();
  return {
    id,
    name: addr ? titleCaseAddress(addr) : "Parcel " + id,
    polygon,
    center,
    acres,
    sunQuality,
    maxPanels,
    price,
    owned: false,
    tilt: Math.round(config.latitude),
    sheep: 0,
    panels: {},
    batteries: {},
  };
}

// Turn the real On Top of the World buildings into game parcels. Each building's
// footprint is approximated by a small rectangle centered on its address; size,
// panel capacity, and price scale with the building's unit count. Sun quality
// and price jitter are deterministic (seeded per building name) so a given zip
// always produces the same world.
function generateRealParcels(config) {
  const parcels = [];
  BUILDING_PLOTS.forEach((b, id) => {
    const rng = makeRng(seedFromString(config.zip + "|" + b.name));
    // Bigger buildings (more units) get more roof area.
    const acres = +(0.18 + b.units * 0.012).toFixed(2);
    const sunQuality = +(0.85 + rng() * 0.25).toFixed(3);
    const maxPanels = Math.round(acres * config.panelsPerAcre);
    const price =
      Math.round(
        (6000 + acres * 22000 + (sunQuality - 0.85) * 40000) / 500
      ) * 500;

    // Approximate footprint: a square whose side grows with building size.
    const sideM = Math.max(20, Math.min(55, 16 + b.units * 0.5));
    const halfLat = sideM / 2 / 111320;
    const halfLng =
      sideM / 2 / (111320 * Math.cos((b.lat * Math.PI) / 180));
    const bounds = [
      [b.lat - halfLat, b.lng - halfLng],
      [b.lat + halfLat, b.lng + halfLng],
    ];

    parcels.push({
      id: "P" + id,
      index: id,
      name: b.name,
      units: b.units,
      bounds,
      center: [b.lat, b.lng],
      acres,
      sunQuality,
      maxPanels,
      price,
      owned: false,
      tilt: Math.round(config.latitude),
      sheep: 0,
      panels: {},
      batteries: {},
    });
  });
  return parcels;
}

// Generate a synthetic grid of land parcels around the zip center (fallback for
// zips without real plot data).
function generateGridParcels(config) {
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
      const maxPanels = Math.round(acres * config.panelsPerAcre);
      // Price scales with area and sun quality.
      const price = Math.round(
        (6000 + acres * 22000 + (sunQuality - 0.85) * 40000) / 500
      ) * 500;

      parcels.push({
        id: "P" + id,
        index: id,
        // Human-readable street address; filled in below from BUILDING_NAMES.
        name: "P" + id,
        bounds,
        center: [lat - dLat / 2, lng + dLng / 2],
        acres,
        sunQuality,
        maxPanels,
        price,
        owned: false,
        // Mounting tilt in degrees; defaults to the latitude-optimal annual tilt.
        tilt: Math.round(config.latitude),
        sheep: 0,
        // installed gear: { panelTypeId: count }, batteries: { batteryTypeId: count }
        panels: {},
        batteries: {},
      });
      id++;
    }
  }

  assignParcelNames(parcels, config);
  return parcels;
}

// Give each parcel a real-world street address from BUILDING_NAMES. A separate
// seeded RNG shuffles the address pool so names are varied yet deterministic per
// zip, without perturbing the parcel-geometry RNG stream above.
function assignParcelNames(parcels, config) {
  if (typeof BUILDING_NAMES === "undefined" || BUILDING_NAMES.length === 0) {
    return;
  }
  const pool = BUILDING_NAMES.slice();
  const rng = makeRng(seedFromString(config.zip + "|names"));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  parcels.forEach((p, i) => {
    p.name = pool[i % pool.length];
  });
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
    // Track parcel ids already loaded (used by the live viewport loader).
    this.parcelIds = new Set(this.parcels.map((p) => p.id));
  }

  // Ingest county GIS parcel features, skipping any already loaded. Returns the
  // parcels that were newly added so the map can render just those.
  addParcelsFromFeatures(features) {
    const added = [];
    for (const f of features) {
      const a = f.attributes || {};
      const id = String(a.PARCELID || a.OBJECTID);
      if (!id || this.parcelIds.has(id)) continue;
      const parcel = parcelFromFeature(f, this.config);
      if (!parcel) continue;
      this.parcelIds.add(parcel.id);
      this.parcels.push(parcel);
      added.push(parcel);
    }
    return added;
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

  // ---- tilt physics ----
  // Solar declination (deg) for a representative day in each month.
  solarDeclination(monthIdx) {
    const dayOfYear = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][monthIdx];
    return 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  }
  // Tilt (deg) that maximizes irradiance at solar noon for a given month.
  optimalTilt(monthIdx) {
    return this.config.latitude - this.solarDeclination(monthIdx);
  }
  // Single fixed tilt that best serves the whole year (sun-weighted).
  optimalAnnualTilt() {
    if (this._optTilt != null) return this._optTilt;
    let best = 0, bestScore = -1;
    for (let t = 0; t <= 60; t++) {
      let s = 0;
      for (let m = 0; m < 12; m++) {
        s += this.config.peakSunHours[m] * this.config.daysInMonth[m] * this.tiltFactor(t, m);
      }
      if (s > bestScore) { bestScore = s; best = t; }
    }
    this._optTilt = best;
    return best;
  }
  // Relative output (0..1) of a tilt vs. that month's optimum. A floor models
  // diffuse/ground-reflected light that reaches even a poorly aimed panel.
  tiltFactor(tilt, monthIdx) {
    const diff = ((tilt - this.optimalTilt(monthIdx)) * Math.PI) / 180;
    const beam = Math.cos(diff);
    return 0.18 + 0.82 * Math.max(0, beam);
  }

  totalPanels() {
    return this.ownedParcels().reduce((a, p) => a + this.parcelPanelCount(p), 0);
  }

  // Nameplate DC capacity of one parcel (kW) — used for levels & display.
  parcelCapacityKw(p) {
    let w = 0;
    for (const [tid, n] of Object.entries(p.panels)) {
      const t = this.panelType(tid);
      if (t) w += t.wattage * n;
    }
    return w / 1000;
  }

  // Yield-weighted capacity (kW) — folds each panel type's yieldFactor in, so
  // higher tiers produce more energy per slot of limited land.
  parcelYieldKw(p) {
    let w = 0;
    for (const [tid, n] of Object.entries(p.panels)) {
      const t = this.panelType(tid);
      if (t) w += t.wattage * n * (t.yieldFactor || 1);
    }
    return w / 1000;
  }

  totalCapacityKw() {
    let kw = 0;
    for (const p of this.ownedParcels()) kw += this.parcelCapacityKw(p);
    return kw;
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

  // ---- sheep / agrivoltaics ----
  totalSheep() {
    return this.ownedParcels().reduce((a, p) => a + Math.floor(p.sheep), 0);
  }
  // Healthy carrying capacity (head) for a parcel, by acreage.
  parcelSheepCapacity(p) {
    return Math.max(1, Math.round(p.acres / SHEEP.acresPerSheep));
  }
  // Land-optimal stocking ratio: panels and sheep both scale with acreage, so
  // this is constant. panelsPerAcre × acresPerSheep = panels per sheep.
  panelsPerSheep() {
    return Math.round(this.config.panelsPerAcre * SHEEP.acresPerSheep);
  }
  // Grazing health 0..1 — drops when the flock exceeds carrying capacity.
  parcelGrazingHealth(p) {
    const cap = this.parcelSheepCapacity(p);
    if (p.sheep <= cap) return 1;
    return Math.max(0.3, cap / p.sheep);
  }

  // Production for one parcel in a month (kWh). Optional tiltOverride lets the
  // UI preview a slider value without mutating state.
  parcelMonthKwh(p, monthIdx, tiltOverride) {
    const psh = this.config.peakSunHours[monthIdx];
    const days = this.config.daysInMonth[monthIdx];
    const tilt = tiltOverride == null ? p.tilt : tiltOverride;
    return (
      this.parcelYieldKw(p) *
      psh *
      days *
      this.config.performanceRatio *
      p.sunQuality *
      this.tiltFactor(tilt, monthIdx)
    );
  }

  // Full-year production for one parcel (kWh) at its current or an override tilt.
  parcelAnnualKwh(p, tiltOverride) {
    let kwh = 0;
    for (let m = 0; m < 12; m++) kwh += this.parcelMonthKwh(p, m, tiltOverride);
    return kwh;
  }

  // Annual energy from a single panel of type t on parcel p (for shop comparison).
  panelSlotAnnualKwh(p, t) {
    let kwh = 0;
    const kw = (t.wattage * (t.yieldFactor || 1)) / 1000;
    for (let m = 0; m < 12; m++) {
      kwh +=
        kw *
        this.config.peakSunHours[m] *
        this.config.daysInMonth[m] *
        this.config.performanceRatio *
        p.sunQuality *
        this.tiltFactor(p.tilt, m);
    }
    return kwh;
  }

  // Estimated production for a given month index (0-11) across all owned land.
  estimateMonthKwh(monthIdx) {
    let kwh = 0;
    for (const p of this.ownedParcels()) kwh += this.parcelMonthKwh(p, monthIdx);
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
    return { ok: true, msg: `Purchased ${p.name} for ${money(p.price)}.` };
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
    return { ok: true, msg: `Installed ${n} × ${t.name} on ${p.name}.` };
  }

  setTilt(parcelId, deg) {
    const p = this.parcels.find((x) => x.id === parcelId);
    if (!p || !p.owned) return { ok: false, msg: "Unavailable." };
    p.tilt = Math.max(0, Math.min(60, Math.round(deg)));
    return { ok: true, msg: `Set ${p.name} tilt to ${p.tilt}°.`, quiet: true };
  }

  addSheep(parcelId, count) {
    const p = this.parcels.find((x) => x.id === parcelId);
    if (!p || !p.owned) return { ok: false, msg: "Buy this plot first." };
    const cost = count * SHEEP.cost;
    if (this.cash < cost)
      return { ok: false, msg: `Need ${money(cost)} for ${count} sheep.` };
    this.cash -= cost;
    p.sheep += count;
    return { ok: true, msg: `Added ${count} sheep to ${p.name}.` };
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
    return { ok: true, msg: `Installed ${count} × ${b.name} on ${p.name}.` };
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

    // Per-parcel upkeep, sheep grazing savings, meat revenue, and flock growth.
    let grossUpkeep = 0;
    let grazeSavings = 0;
    let meatRevenue = 0;
    for (const p of this.ownedParcels()) {
      const panelUpkeep =
        this.parcelPanelCount(p) * this.config.maintenancePerPanelPerMonth;
      grossUpkeep += panelUpkeep;
      if (p.sheep >= 1) {
        const cap = this.parcelSheepCapacity(p);
        const coverage = Math.min(1, p.sheep / cap); // how much grass is grazed
        const health = this.parcelGrazingHealth(p);
        grazeSavings += panelUpkeep * SHEEP.upkeepReductionPerPanel * coverage;
        meatRevenue +=
          Math.floor(p.sheep) * SHEEP.meatRevenuePerSheepPerMonth * health;
        // Flock breeds toward carrying capacity and holds there (no self-inflicted
        // overgrazing). Overgrazing only happens if the player over-buys.
        if (p.sheep < cap) {
          p.sheep = Math.min(cap, p.sheep * (1 + SHEEP.monthlyGrowth * health));
        }
      }
    }
    const upkeep = Math.max(0, grossUpkeep - grazeSavings);
    const budget = this.config.monthlyBudget;
    const net = revenue + meatRevenue - upkeep + budget;

    this.cash += net;
    this.lifetimeKwh += kwh;
    this.lifetimeRevenue += revenue + meatRevenue;
    this.lifetimeCo2Kg += kwh * this.config.co2KgPerKwh;

    const label = `${this.config.monthNames[m]} Y${this.year}`;
    this.history.push({ label, kwh, revenue, net });
    if (this.history.length > 24) this.history.shift();

    this.lastMonth = {
      label, kwh, revenue, upkeep, budget, net,
      sellFraction, storageKwh, capacityKw,
      meatRevenue, grazeSavings, sheep: this.totalSheep(),
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
