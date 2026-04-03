import { randomUUID } from 'crypto';

export function handleConstructions(req, { manager }) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const constructions = manager.getConstructions().map(c => ({
      ...c,
      commodities: manager.getCommoditySlots(c.id),
    }));
    return json(constructions);
  }

  if (req.method === 'POST') {
    return req.json().then(body => {
      const id = manager.createConstruction(body);
      return json(manager.getConstruction(id), 201);
    });
  }

  return notFound();
}

export function handleConstruction(req, id, { manager }) {
  if (req.method === 'GET') {
    const c = manager.getConstruction(id);
    if (!c) return notFound();
    return json({ ...c, commodities: manager.getCommoditySlots(id) });
  }

  if (req.method === 'DELETE') {
    manager.deleteConstruction(id);
    return new Response(null, { status: 204 });
  }

  return notFound();
}

export function handleCommodities(req, constructionId, { manager }) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const commodityName = segments[segments.length - 1];

  if (req.method === 'GET') return json(manager.getCommoditySlots(constructionId));

  if (req.method === 'PATCH') {
    return req.json().then(body => {
      if (body.amount_required !== undefined) {
        manager.upsertCommodity(constructionId, { name: decodeURIComponent(commodityName), amount_required: body.amount_required });
      }
      if (body.amount_delivered !== undefined) {
        manager.recordDelivery({ construction_id: constructionId, commodity_name: decodeURIComponent(commodityName), amount: body.amount_delivered, source: 'manual' });
      }
      return json(manager.getCommoditySlots(constructionId));
    });
  }

  return notFound();
}

export function handleRefreshStations(req, constructionId, { stationLookupService }) {
  if (req.method !== 'POST') return notFound();
  const queued = stationLookupService.refreshConstruction(constructionId);
  return json({ queued });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const notFound = () => new Response('Not Found', { status: 404 });
