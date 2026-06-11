/* SolarCity — Leaflet map layer. Renders land parcels and reflects state. */

class GameMap {
  constructor(game, onSelect) {
    this.game = game;
    this.onSelect = onSelect;
    this.layers = {}; // parcelId -> L.rectangle

    this.map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
    }).setView([game.config.center.lat, game.config.center.lng], game.config.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this.map);

    // Marker for the zip center.
    L.circleMarker([game.config.center.lat, game.config.center.lng], {
      radius: 5,
      color: "#fbbf24",
      fillColor: "#fbbf24",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(this.map)
      .bindTooltip(`Zip ${game.config.zip} center`, { direction: "top" });

    this.renderParcels();
  }

  renderParcels() {
    const group = [];
    for (const p of this.game.parcels) {
      const rect = L.rectangle(p.bounds, this.styleFor(p))
        .addTo(this.map)
        .on("click", () => this.onSelect(p.id));
      rect.bindTooltip(this.tooltipFor(p), { sticky: true });
      this.layers[p.id] = rect;
      group.push(rect);
    }
    // Frame all plots so the whole community is visible regardless of count.
    if (group.length > 1) {
      const bounds = L.featureGroup(group).getBounds();
      this.map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  styleFor(p) {
    const selected = this.game.selectedParcelId === p.id;
    if (!p.owned) {
      // For-sale plots tinted by sun quality (greener = sunnier).
      const t = (p.sunQuality - 0.85) / 0.25; // 0..1
      const g = Math.round(150 + t * 90);
      return {
        color: selected ? "#ffffff" : "#16a34a",
        weight: selected ? 3 : 1.5,
        fillColor: `rgb(40, ${g}, 80)`,
        fillOpacity: 0.5,
      };
    }
    // Owned: fill opacity grows with how built-out the plot is.
    const built = this.game.parcelPanelCount(p) / Math.max(1, p.maxPanels);
    return {
      color: selected ? "#ffffff" : "#f59e0b",
      weight: selected ? 3 : 2,
      fillColor: "#f59e0b",
      fillOpacity: 0.25 + 0.6 * Math.min(1, built),
    };
  }

  tooltipFor(p) {
    if (!p.owned) {
      return `<b>${p.name}</b> — For sale<br>${p.acres} ac · sun ${(
        p.sunQuality * 100
      ).toFixed(0)}%<br><b>${money(p.price)}</b>`;
    }
    const panels = this.game.parcelPanelCount(p);
    return `<b>${p.name}</b> — Owned<br>${panels}/${p.maxPanels} panels`;
  }

  refresh() {
    for (const p of this.game.parcels) {
      const layer = this.layers[p.id];
      if (!layer) continue;
      layer.setStyle(this.styleFor(p));
      layer.setTooltipContent(this.tooltipFor(p));
    }
  }

  focus(parcelId) {
    const p = this.game.parcels.find((x) => x.id === parcelId);
    if (p) this.map.panTo(p.center);
  }
}
