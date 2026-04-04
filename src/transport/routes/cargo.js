export function handleCargoUpdate(req, { cargoTracker }) {
  if (req.method !== 'PATCH') return new Response('Method Not Allowed', { status: 405 });

  return new Promise(async (resolve) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return resolve(new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const { commodityName, count } = body;
    if (!commodityName || typeof count !== 'number') {
      return resolve(new Response(JSON.stringify({ error: 'commodityName and count are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    cargoTracker.updateFcCargo(commodityName, count);
    return resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }));
  });
}
