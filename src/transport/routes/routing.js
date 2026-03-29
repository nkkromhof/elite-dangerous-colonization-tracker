export function handleRouting(req, commodity, { finder, cargoTracker }) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(req.url);
  const system = url.searchParams.get('system') ?? 'Sol';
  const prefer = url.searchParams.get('prefer') ?? 'both';
  return finder.findNearest(decodeURIComponent(commodity), system, prefer)
    .then(stations => new Response(JSON.stringify(stations), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }))
    .catch(err => new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
}
