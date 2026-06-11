# SolarCity — a solar tycoon game for a real zip code

SimCity-style city builder, but for solar power on real land. Pick plots of
land for sale on an interactive map of a real zip code, install solar panels and
batteries, and grow your clean-energy empire month over month on a budget.

**Default location:** Clearwater, FL — zip `33763`.

![SolarCity gameplay](docs/screenshot.png)

## Gameplay

1. **Buy land** — click a green *For Sale* plot on the map and purchase it.
   Each plot has a size (acres), a sun-quality rating, a panel capacity, and a
   price.
2. **Build & optimize** — install solar panels (multiple tiers), tune the
   **tilt angle** for maximum yield, add batteries, and graze **sheep** on the
   land. The goal is to squeeze the most profit out of every parcel.
3. **Advance the month** — press *Advance Month* to simulate energy production,
   sell power to the grid, sell meat, pay upkeep, and collect your monthly
   investment budget.
4. **Grow & level up** — reinvest your budget, raise total capacity to unlock
   better panels/batteries, complete goals for bonus cash, and climb from
   *Rooftop Rookie* to *Sun Baron*.

### Maximizing profit per parcel

The core optimization is three levers per parcel:

- **Tilt angle (0–60°)** — a per-parcel slider with live feedback. Production
  peaks at the latitude-optimal tilt (~26° for Clearwater) and falls off as you
  deviate, modeled from monthly solar declination. The inspector shows annual
  kWh, estimated revenue, and your % of the plot's optimal yield in real time.
- **Panel type** — Standard / Premium / Bifacial differ not just in wattage and
  cost but in **energy yield per panel** (`yieldFactor`). Because land caps the
  number of panels, higher tiers can mean more kWh per limited slot. The shop
  shows each type's kWh/yr per panel and its $/kWh·yr cost-efficiency.
- **Sheep (agrivoltaics)** — graze the grass under the panels to cut
  maintenance, and breed the flock for monthly meat revenue. Each parcel has a
  carrying capacity by acreage; the **optimal stocking is 1 sheep per 64
  panels** (both scale with land). Overstock past capacity and overgrazing cuts
  meat yield.

### What makes it a game

- **Monthly budget loop** — a fixed monthly allowance plus energy revenue,
  minus maintenance, funds your expansion. Spend wisely.
- **Seasonal simulation** — production uses real-ish monthly peak-sun-hours for
  the Tampa Bay area, so winter months yield less.
- **Batteries matter** — without storage, some midday overproduction is
  curtailed; adding batteries raises the share of energy you can actually sell.
- **Tilt physics** — a tilt-efficiency factor derived from monthly solar
  declination rewards aiming panels at the latitude-optimal angle.
- **Agrivoltaics** — sheep are a second income stream (meat) that also lowers
  panel-upkeep costs by grazing, with realistic carrying-capacity limits.
- **Goals, levels & score** — one-time goals award cash, capacity milestones
  unlock gear, and a score tracks lifetime CO₂ offset + revenue + capacity.

## Run it

It's a fully static site — no build step.

```bash
cd solar-city
python3 -m http.server 8000
# open http://localhost:8000
```

Leaflet is vendored locally under `vendor/leaflet/`, so the only thing that
needs an internet connection is the map tiles (served by OpenStreetMap).

## Live Clearwater parcels

With `CONFIG.liveParcels.enabled = true` (the default), the plots are **every
real parcel in the City of Clearwater** (~69,000 of them), streamed on demand
from [Pinellas County GIS](https://egis.pinellas.gov) as you pan and zoom. The
game starts with no plots; whenever the map stops moving, `GameMap.loadViewport`
queries the county `Parcels` layer for parcels intersecting the current viewport
(`SITE_CITY='CLEARWATER'`, up to `maxPerView` per request) and adds any not yet
loaded. Each parcel is drawn as its **real lot polygon**; its name is the county
`SITE_ADDRESS`, its size is the county `Acres`, and a deterministic per-parcel
seed (from `PARCELID`) sets sun quality, panel capacity, and price so the world
is stable across reloads. A status box (top-right) shows how many plots are
loaded and prompts you to zoom in when a view is capped. The query is CORS-
enabled, so it runs straight from the browser with no backend; this is the only
feature that needs network beyond the map tiles. Below `minZoom` the loader
pauses (too many parcels to draw at city scale) — zoom in to populate plots.

### Fixed plot sets (fallback)

Set `CONFIG.liveParcels.enabled = false` to use a fixed plot set instead. With
`CONFIG.useRealPlots = true`, the plots are the **real buildings** of the On Top
of the World community (zip 33763): `BUILDING_PLOTS` in `js/data.js` holds one
`{ name, lat, lng, units }` per building (address points matched to
`docs/buildings.csv`), and the map auto-fits to show every plot. With
`useRealPlots = false`, plots fall back to the deterministic synthetic grid
(labeled from the `BUILDING_NAMES` address pool) for zips without real data.

## Change the zip code

Edit `js/data.js` and update `CONFIG.zip`, `CONFIG.cityName`, and
`CONFIG.center` (lat/lng). With `useRealPlots = false`, land plots are generated
deterministically from the zip, and `CONFIG.peakSunHours` can be tuned for the
local climate.

## Project structure

```
index.html      layout + HUD
styles.css      dark, game-like UI styling
js/data.js      config & catalogs (panels, batteries, levels, goals)
js/game.js      game state + month-by-month simulation engine
js/map.js       Leaflet map + land-parcel rendering
js/ui.js        DOM rendering & interaction wiring
js/main.js      bootstrap
```

## Tech

Vanilla JavaScript, [Leaflet](https://leafletjs.com/) for the interactive map,
and OpenStreetMap tiles. No framework, no build tooling.
