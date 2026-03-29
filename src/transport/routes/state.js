export function handleState(req, { manager, cargoTracker }) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const constructions = manager.getConstructions().map(c => ({
    ...c,
    commodities: manager.getCommoditySlots(c.id),
  }));
  const state = {
    constructions,
    cargo: { ship: cargoTracker.getShipCargo(), fc: cargoTracker.getFcCargo() },
  };
  return new Response(JSON.stringify(state), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
