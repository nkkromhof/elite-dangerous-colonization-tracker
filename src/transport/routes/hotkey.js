/**
 * POST /api/hotkey/next-tab  →  broadcasts { direction: 'next' }
 * POST /api/hotkey/prev-tab  →  broadcasts { direction: 'prev' }
 */
export function handleHotkey(req, direction, { sseHandler }) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  sseHandler.broadcast('tab_change', { direction });
  return new Response(null, { status: 204 });
}
