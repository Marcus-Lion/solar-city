/* SolarCity — DOM rendering & interaction wiring. */

class UI {
  constructor(game, gameMap) {
    this.game = game;
    this.gameMap = gameMap;
    this.cache();
    this.bind();
    this.renderAll();
  }

  cache() {
    this.el = {
      cash: document.getElementById("stat-cash"),
      date: document.getElementById("stat-date"),
      capacity: document.getElementById("stat-capacity"),
      storage: document.getElementById("stat-storage"),
      level: document.getElementById("stat-level"),
      score: document.getElementById("stat-score"),
      co2: document.getElementById("stat-co2"),
      levelBar: document.getElementById("level-bar"),
      levelHint: document.getElementById("level-hint"),
      advanceBtn: document.getElementById("advance-btn"),
      advancePreview: document.getElementById("advance-preview"),
      inspector: document.getElementById("inspector"),
      goals: document.getElementById("goals"),
      history: document.getElementById("history"),
      lastMonth: document.getElementById("last-month"),
      toasts: document.getElementById("toasts"),
    };
  }

  bind() {
    this.el.advanceBtn.addEventListener("click", () => this.onAdvance());
  }

  // ---------- top-level render ----------
  renderAll() {
    this.renderStats();
    this.renderInspector();
    this.renderGoals();
    this.renderHistory();
    this.gameMap.refresh();
  }

  renderStats() {
    const g = this.game;
    this.el.cash.textContent = money(g.cash);
    this.el.cash.classList.toggle("danger", g.cash < 0);
    this.el.date.textContent = `${g.config.monthNames[g.monthIndex % 12]} · Year ${g.year}`;
    this.el.capacity.textContent = g.totalCapacityKw().toFixed(1) + " kW";
    this.el.storage.textContent = g.totalBatteryKwh().toFixed(0) + " kWh";
    this.el.score.textContent = g.score().toLocaleString("en-US");
    this.el.co2.textContent = (g.lifetimeCo2Kg / 1000).toFixed(2) + " t";

    const lvl = g.level();
    const next = g.nextLevel();
    this.el.level.textContent = `L${lvl.level} · ${lvl.title}`;
    if (next) {
      const cap = g.totalCapacityKw();
      const span = next.capacityKw - lvl.capacityKw;
      const pct = Math.max(0, Math.min(100, ((cap - lvl.capacityKw) / span) * 100));
      this.el.levelBar.style.width = pct + "%";
      this.el.levelHint.textContent = `${(next.capacityKw - cap).toFixed(1)} kW to L${next.level} (${next.title})`;
    } else {
      this.el.levelBar.style.width = "100%";
      this.el.levelHint.textContent = "Max level reached — you are a Sun Baron!";
    }

    const preview = g.previewNextMonthKwh();
    this.el.advancePreview.textContent =
      preview > 0
        ? `~${Math.round(preview).toLocaleString()} kWh next month`
        : "Buy land & panels to start producing";
  }

  // ---------- parcel inspector ----------
  selectParcel(id) {
    this.game.selectedParcelId = id;
    this.gameMap.focus(id);
    this.renderInspector();
    this.gameMap.refresh();
  }

  renderInspector() {
    const g = this.game;
    const p = g.parcels.find((x) => x.id === g.selectedParcelId);
    const box = this.el.inspector;
    if (!p) {
      box.innerHTML = `<p class="muted">Click a plot on the map to inspect it.</p>`;
      return;
    }

    if (!p.owned) {
      box.innerHTML = `
        <h3>${p.id} — For Sale</h3>
        <div class="kv"><span>Size</span><b>${p.acres} acres</b></div>
        <div class="kv"><span>Sun quality</span><b>${(p.sunQuality * 100).toFixed(0)}%</b></div>
        <div class="kv"><span>Panel capacity</span><b>${p.maxPanels} panels</b></div>
        <div class="kv"><span>Price</span><b>${money(p.price)}</b></div>
        <button class="btn primary" id="buy-btn" ${g.cash < p.price ? "disabled" : ""}>
          Buy this plot · ${money(p.price)}
        </button>`;
      const btn = document.getElementById("buy-btn");
      if (btn) btn.onclick = () => this.act(g.buyParcel(p.id));
      return;
    }

    const used = g.parcelPanelCount(p);
    const built = Math.min(1, used / Math.max(1, p.maxPanels));
    let parcelKw = 0;
    for (const [tid, n] of Object.entries(p.panels)) {
      const t = g.panelType(tid);
      if (t) parcelKw += (t.wattage * n) / 1000;
    }

    const panelShop = PANEL_TYPES.map((t) => {
      const locked = t.unlockLevel > g.level().level;
      const owned = p.panels[t.id] || 0;
      return `
        <div class="shop-row ${locked ? "locked" : ""}">
          <span class="swatch" style="background:${t.color}"></span>
          <div class="shop-info">
            <b>${t.name}</b> <span class="muted">${money(t.cost)}/ea · ${owned} installed</span>
            <div class="muted small">${locked ? "Unlocks at L" + t.unlockLevel : t.blurb}</div>
          </div>
          <div class="shop-actions">
            <button class="btn mini" data-panel="${t.id}" data-n="1" ${locked ? "disabled" : ""}>+1</button>
            <button class="btn mini" data-panel="${t.id}" data-n="10" ${locked ? "disabled" : ""}>+10</button>
          </div>
        </div>`;
    }).join("");

    const batteryShop = BATTERY_TYPES.map((b) => {
      const locked = b.unlockLevel > g.level().level;
      const owned = p.batteries[b.id] || 0;
      return `
        <div class="shop-row ${locked ? "locked" : ""}">
          <span class="swatch" style="background:${b.color}"></span>
          <div class="shop-info">
            <b>${b.name}</b> <span class="muted">${money(b.cost)} · ${owned} installed</span>
            <div class="muted small">${locked ? "Unlocks at L" + b.unlockLevel : b.blurb}</div>
          </div>
          <div class="shop-actions">
            <button class="btn mini" data-batt="${b.id}" data-n="1" ${locked ? "disabled" : ""}>+1</button>
          </div>
        </div>`;
    }).join("");

    box.innerHTML = `
      <h3>${p.id} — Owned</h3>
      <div class="kv"><span>Capacity</span><b>${parcelKw.toFixed(1)} kW</b></div>
      <div class="kv"><span>Panels</span><b>${used} / ${p.maxPanels}</b></div>
      <div class="fill"><div class="fill-bar" style="width:${built * 100}%"></div></div>
      <div class="grid-viz">${this.gridViz(p)}</div>
      <h4>Add panels</h4>
      ${panelShop}
      <h4>Add storage</h4>
      ${batteryShop}`;

    box.querySelectorAll("button[data-panel]").forEach((btn) => {
      btn.onclick = () =>
        this.act(g.addPanels(p.id, btn.dataset.panel, +btn.dataset.n));
    });
    box.querySelectorAll("button[data-batt]").forEach((btn) => {
      btn.onclick = () =>
        this.act(g.addBattery(p.id, btn.dataset.batt, +btn.dataset.n));
    });
  }

  // A small visual grid of installed panels (capped cells for readability).
  gridViz(p) {
    const cells = 60;
    const used = this.game.parcelPanelCount(p);
    const filled = Math.round((used / Math.max(1, p.maxPanels)) * cells);
    // Determine dominant color by most-installed type.
    let color = "#3b82f6";
    let max = 0;
    for (const [tid, n] of Object.entries(p.panels)) {
      if (n > max) {
        max = n;
        const t = this.game.panelType(tid);
        if (t) color = t.color;
      }
    }
    let html = "";
    for (let i = 0; i < cells; i++) {
      const on = i < filled;
      html += `<span class="cell" style="background:${on ? color : "#1e293b"}"></span>`;
    }
    return html;
  }

  // ---------- goals & history ----------
  renderGoals() {
    const g = this.game;
    this.el.goals.innerHTML = GOALS.map((goal) => {
      const done = !!g.completedGoals[goal.id];
      return `<li class="${done ? "done" : ""}">
        <span class="tick">${done ? "✓" : "○"}</span>
        <span>${goal.name}</span>
        <span class="reward">${money(goal.reward)}</span>
      </li>`;
    }).join("");
  }

  renderHistory() {
    const g = this.game;
    if (!g.lastMonth) {
      this.el.lastMonth.innerHTML = `<span class="muted">No months simulated yet. Press “Advance Month”.</span>`;
    } else {
      const m = g.lastMonth;
      this.el.lastMonth.innerHTML = `
        <b>${m.label}</b> — produced <b>${Math.round(m.kwh).toLocaleString()} kWh</b><br>
        revenue ${money(m.revenue)} · budget ${money(m.budget)} · upkeep -${money(m.upkeep)}
        → net <b class="${m.net >= 0 ? "pos" : "neg"}">${money(m.net)}</b>
        <span class="muted small"> (sold ${(m.sellFraction * 100).toFixed(0)}% of output)</span>`;
    }

    const hist = g.history;
    const maxKwh = Math.max(1, ...hist.map((h) => h.kwh));
    this.el.history.innerHTML = hist
      .map(
        (h) =>
          `<div class="bar" title="${h.label}: ${Math.round(h.kwh).toLocaleString()} kWh">
             <div class="bar-fill" style="height:${(h.kwh / maxKwh) * 100}%"></div>
           </div>`
      )
      .join("");
  }

  // ---------- actions / feedback ----------
  onAdvance() {
    const { last, newlyCompleted } = this.game.advanceMonth();
    this.toast(
      `${last.label}: +${money(last.net)} (${Math.round(last.kwh).toLocaleString()} kWh)`,
      last.net >= 0 ? "ok" : "warn"
    );
    for (const goal of newlyCompleted) {
      this.toast(`Goal complete: ${goal.name} (+${money(goal.reward)})`, "goal");
    }
    this.renderAll();
  }

  act(result) {
    this.toast(result.msg, result.ok ? "ok" : "warn");
    if (result.ok) {
      // Completing a purchase may immediately satisfy a goal.
      const newly = this.game.checkGoals();
      for (const goal of newly)
        this.toast(`Goal complete: ${goal.name} (+${money(goal.reward)})`, "goal");
    }
    this.renderAll();
  }

  toast(msg, kind = "ok") {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add("fade");
      setTimeout(() => t.remove(), 400);
    }, 2600);
  }
}
