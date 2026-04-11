import { handleConstructions, handleConstruction, handleCommodities, handleRefreshStations } from './routes/constructions.js';
import { handlePhaseTransition } from './routes/phase.js';
import { handleHotkey } from './routes/hotkey.js';
import { handleState } from './routes/state.js';
import { handleCargoUpdate } from './routes/cargo.js';
import { handleCommodityList } from './routes/commodities.js';

/**
 * @param {object} deps
 * @param {import('../core/construction-manager.js').ConstructionManager} deps.manager
 * @param {import('../core/phase-machine.js').PhaseMachine} deps.machine
 * @param {import('../core/cargo-tracker.js').CargoTracker} deps.cargoTracker
 * @param {import('./sse-handler.js').SseHandler} deps.sseHandler
 * @param {number} port
 */
export function startHttpServer(deps, port) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' } });
      }

      // SSE stream
      if (path === '/api/events') return deps.sseHandler.createStream();

      // Hotkey tab navigation
      if (path === '/api/hotkey/next-tab') return handleHotkey(req, 'next', deps);
      if (path === '/api/hotkey/prev-tab') return handleHotkey(req, 'prev', deps);

      // State snapshot
      if (path === '/api/state') return handleState(req, deps);

      // Commodities reference list (for manual construction picker)
      if (path === '/api/commodities') return handleCommodityList(req);

      // Constructions
      if (path === '/api/constructions') return handleConstructions(req, deps);

      const constructionMatch = path.match(/^\/api\/constructions\/([^/]+)$/);
      if (constructionMatch) return handleConstruction(req, constructionMatch[1], deps);

      const phaseMatch = path.match(/^\/api\/constructions\/([^/]+)\/phase$/);
      if (phaseMatch) return handlePhaseTransition(req, phaseMatch[1], deps);

      const commoditiesMatch = path.match(/^\/api\/constructions\/([^/]+)\/commodities$/);
      if (commoditiesMatch) return handleCommodities(req, commoditiesMatch[1], deps);

      const commodityMatch = path.match(/^\/api\/constructions\/([^/]+)\/commodities\/(.+)$/);
      if (commodityMatch) return handleCommodities(req, commodityMatch[1], deps);

      const refreshMatch = path.match(/^\/api\/constructions\/([^/]+)\/refresh-stations$/);
      if (refreshMatch) return handleRefreshStations(req, refreshMatch[1], deps);

      // Cargo update
      if (path === '/api/cargo/fc') return handleCargoUpdate(req, deps);

      // Serve static files from public/dist/ (Vite build output) with public/ fallback
      if (path === '/' || !path.startsWith('/api')) {
        const filePath = path === '/' ? '/index.html' : path;
        // Try dist first (Vite build), then public root (for shared files like inara-commodity-ids.js)
        for (const dir of ['./public/dist', './public']) {
          const file = Bun.file(dir + filePath);
          if (await file.exists()) {
            const contentType = filePath.endsWith('.css') ? 'text/css' :
                                filePath.endsWith('.js') ? 'application/javascript' :
                                'text/html';
            return new Response(file, { headers: { 'Content-Type': contentType } });
          }
        }
      }
      return new Response('Not Found', { status: 404 });
    },
  });

  console.log(`ED Colonisation Tracker listening on port ${port}`);
  return server;
}
