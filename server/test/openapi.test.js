import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase } from '../db/pool.js';
import { initDatabase } from '../db/schema.js';
import { createApp } from '../index.js';
import demoRoutes from '../routes/demo.js';
import groupRoutes from '../routes/groups.js';
import inboxRoutes from '../routes/inbox.js';
import itemRoutes from '../routes/items.js';
import loanRoutes from '../routes/loans.js';
import managerRoutes from '../routes/manager.js';

function normalizeExpressPath(prefix, routePath) {
  const joined = `${prefix}${routePath === '/' ? '' : routePath}`;
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectRouterEndpoints(router, prefix) {
  const endpoints = [];
  const stack = router.stack ?? [];
  for (const layer of stack) {
    if (layer.route) {
      const normalized = normalizeExpressPath(prefix, layer.route.path);
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) {
          endpoints.push(`${method.toUpperCase()} ${normalized}`);
        }
      }
    }
  }
  return endpoints;
}

describe('v3 Slice 6: OpenAPI 3.0.3 & Swagger UI (/api/docs) route coverage', () => {
  let server;
  let baseUrl;
  const origDemo = process.env.DEMO_MODE;

  before(async () => {
    process.env.DEMO_MODE = 'true';
    await initDatabase();
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    process.env.DEMO_MODE = origDemo;
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
  });

  it('serves OpenAPI 3.0.3 JSON at /api/openapi.json and interactive Swagger UI at /api/docs/', async () => {
    const jsonRes = await fetch(`${baseUrl}/api/openapi.json`);
    assert.equal(jsonRes.status, 200);
    const spec = await jsonRes.json();
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.title, 'Otonari API');
    assert.ok(spec.components.securitySchemes.ResidentBearerAuth);
    assert.ok(spec.components.securitySchemes.ManagerBearerAuth);

    const docsRes = await fetch(`${baseUrl}/api/docs/`);
    assert.equal(docsRes.status, 200);
    const html = await docsRes.text();
    assert.match(html, /swagger-ui/i);
    assert.match(html, /Otonari API Docs/);
  });

  it('documents 100% of mounted API and upload endpoints in openapi.json with no stale paths', async () => {
    const spec = await (await fetch(`${baseUrl}/api/openapi.json`)).json();

    const mounted = new Set([
      'GET /api/health',
      'GET /api/openapi.json',
      'GET /uploads/{filename}',
      ...collectRouterEndpoints(groupRoutes, '/api'),
      ...collectRouterEndpoints(managerRoutes, '/api'),
      ...collectRouterEndpoints(itemRoutes, '/api'),
      ...collectRouterEndpoints(loanRoutes, '/api'),
      ...collectRouterEndpoints(inboxRoutes, '/api'),
      ...collectRouterEndpoints(demoRoutes, '/api'),
    ]);

    const documented = new Set();
    for (const [specPath, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} ${specPath}`);
      }
    }

    const missing = [...mounted].filter((ep) => !documented.has(ep)).sort();
    const extra = [...documented].filter((ep) => !mounted.has(ep)).sort();
    assert.deepEqual(missing, [], `Endpoints missing from openapi.json: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `Stale endpoints in openapi.json: ${extra.join(', ')}`);
  });
});
