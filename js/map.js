/* SolarCity — Leaflet map layer. Renders land parcels and reflects state. */

class GameMap {
  constructor(game, onSelect, onUpdate) {
    this.game = game;
    this.onSelect = onSelect;
    this.onUpdate = onUpdate || (() => {});
    this.layers = {}; // parcelId -> L.rectangle | L.polygon
    this.live = game.config.liveParcels && game.config.liveParcels.enabled
      ? game.config.liveParcels
      : null;
    this.loading = false;

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

    if (this.live) {
      this.status = this.addStatusControl();
      this.map.on("moveend", () => this.loadViewport());
      this.loadViewport();
    }
  }

  addParcelLayer(p) {
    const shape = p.polygon
      ? L.polygon(p.polygon, this.styleFor(p))
      : L.rectangle(p.bounds, this.styleFor(p));
    shape.addTo(this.map).on("click", () => this.onSelect(p.id));
    shape.bindTooltip(this.tooltipFor(p), { sticky: true });
    this.layers[p.id] = shape;
    return shape;
  }

  renderParcels() {
    const group = [];
    for (const p of this.game.parcels) {
      group.push(this.addParcelLayer(p));
    }
    // For a fixed plot set, frame them all. In live mode we keep the viewport.
    if (!this.live && group.length > 1) {
      const bounds = L.featureGroup(group).getBounds();
      this.map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  addStatusControl() {
    const ctrl = L.control({ position: "topright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div", "plot-status");
      div.style.cssText =
        "background:rgba(15,23,42,.85);color:#e2e8f0;padding:4px 8px;" +
        "border-radius:6px;font:12px/1.4 system-ui,sans-serif;max-width:220px;";
      div.textContent = "Loading plots\u2026";
      return div;
    };
    ctrl.addTo(this.map);
    return ctrl;
  }

  setStatus(text) {
    if (this.status && this.status.getContainer())
      this.status.getContainer().textContent = text;
  }

  // Fetch every Clearwater parcel intersecting the current viewport and add any
  // not already loaded. Skipped when zoomed too far out (too many parcels).
  loadViewport() {
    if (!this.live || this.loading) return;
    if (this.map.getZoom() < this.live.minZoom) {
      this.setStatus(
        `Zoom in to load plots (${this.game.parcels.length} loaded)`
      );
      return;
    }
    const b = this.map.getBounds();
    const envelope = {
      xmin: b.getWest(),
      ymin: b.getSouth(),
      xmax: b.getEast(),
      ymax: b.getNorth(),
      spatialReference: { wkid: 4326 },
    };
    const params = new URLSearchParams({
      where: this.live.where,
      geometry: JSON.stringify(envelope),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "PARCELID,SITE_ADDRESS,Acres",
      returnGeometry: "true",
      geometryPrecision: "6",
      resultRecordCount: String(this.live.maxPerView),
      f: "json",
    });
    this.loading = true;
    this.setStatus("Loading plots\u2026");
    fetch(this.live.url + "?" + params.toString())
      .then((r) => r.json())
      .then((data) => {
        const features = (data && data.features) || [];
        const added = this.game.addParcelsFromFeatures(features);
        for (const p of added) this.addParcelLayer(p);
        const capped = features.length >= this.live.maxPerView;
        this.setStatus(
          `${this.game.parcels.length} plots loaded` +
            (capped ? " \u2014 zoom in for more" : "")
        );
        if (added.length) this.onUpdate();
      })
      .catch(() => this.setStatus("Could not load plots (offline?)"))
      .finally(() => {
        this.loading = false;
      });
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
