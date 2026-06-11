/* SolarCity — bootstrap. Wires game state, map, and UI together. */

window.addEventListener("DOMContentLoaded", () => {
  const game = new Game(CONFIG);

  document.getElementById("zip-label").textContent =
    `${CONFIG.cityName} · ${CONFIG.zip}`;

  let ui;
  const gameMap = new GameMap(
    game,
    (parcelId) => ui.selectParcel(parcelId),
    () => ui && ui.renderGoals()
  );
  ui = new UI(game, gameMap);

  // Expose for debugging in the console.
  window.__solar = { game, gameMap, ui };
});
