export function handlePhaseTransition(req, constructionId, { machine }) {
  if (req.method !== 'PATCH') return new Response('Method Not Allowed', { status: 405 });
  return req.json().then(body => {
    try {
      machine.transition(constructionId, body.phase);
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  });
}
