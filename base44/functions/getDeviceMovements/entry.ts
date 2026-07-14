import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const API_BASE = 'https://api.cognosos.net';

// Cache the Cognosos token across invocations of a warm instance —
// Cognito ID tokens are valid for ~1 hour.
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

async function getCognososToken() {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  const configRes = await fetch(`${API_BASE}/config?category=idp`);
  if (!configRes.ok) throw new Error(`Cognosos config fetch failed: ${configRes.status}`);
  const config = await configRes.json();
  const clientId = config?.idp?.client_id;
  const issuerUrl = config?.idp?.issuer_url;
  if (!clientId || !issuerUrl) throw new Error('Missing client_id/issuer_url');

  const authRes = await fetch(issuerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: Deno.env.get('COGNOSOS_USERNAME'),
        PASSWORD: Deno.env.get('COGNOSOS_PASSWORD'),
      },
    }),
  });
  if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
  const auth = await authRes.json();
  const idToken = auth?.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error('No IdToken');
  cachedToken = idToken;
  cachedTokenAt = Date.now();
  return idToken;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { device_id } = payload;
    if (!device_id) return Response.json({ error: 'device_id required' }, { status: 400 });

    const token = await getCognososToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Get applications to find which one this node belongs to
    const appsRes = await fetch(`${API_BASE}/application`, { headers });
    if (!appsRes.ok) throw new Error(`Apps fetch failed: ${appsRes.status}`);
    const appsData = await appsRes.json();
    const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);

    // First, find the actual node ID — the stored device_id may be node.device_id
    // or node.id, but assetMovement expects node.id specifically.
    let effectiveNodeId = device_id;

    // Try direct lookup first
    let testRes = await fetch(
      `${API_BASE}/assetMovement?application_code=${encodeURIComponent(apps[0]?.application_code || apps[0]?.code || '')}&node_id=${device_id}&limit=1`,
      { headers }
    );
    let directWorks = testRes.ok && (await testRes.json()).length > 0;

    if (!directWorks) {
      // Search nodes across apps to find this asset
      for (const app of apps) {
        const appCode = app.application_code || app.code || app.applicationCode;
        if (!appCode) continue;
        let offset = 0;
        const PAGE = 2000;
        while (true) {
          const nodesRes = await fetch(
            `${API_BASE}/node?application_code=${encodeURIComponent(appCode)}&limit=${PAGE}&offset=${offset}`,
            { headers }
          );
          if (!nodesRes.ok) break;
          const nodesData = await nodesRes.json();
          const nodes = Array.isArray(nodesData) ? nodesData : (nodesData.items || nodesData.data || nodesData.nodes || []);
          if (nodes.length === 0) break;
          const match = nodes.find(n =>
            String(n.id) === device_id ||
            String(n.device_id) === device_id ||
            String(n.asset_identifier) === device_id
          );
          if (match) {
            effectiveNodeId = String(match.id);
            break;
          }
          if (nodes.length < PAGE) break;
          offset += PAGE;
        }
        if (effectiveNodeId !== device_id) break; // found a better ID
      }
    }

    // Collect all movements using the effective node ID
    const allMovements = [];
    for (const app of apps) {
      const appCode = app.application_code || app.code || app.applicationCode;
      if (!appCode) continue;

      let offset = 0;
      const PAGE = 500;
      while (true) {
        const url = `${API_BASE}/assetMovement?application_code=${encodeURIComponent(appCode)}&node_id=${effectiveNodeId}&limit=${PAGE}&offset=${offset}`;
        const res = await fetch(url, { headers });
        if (!res.ok) break;
        const data = await res.json();
        const events = Array.isArray(data) ? data : (data.items || []);
        if (events.length === 0) break;
        allMovements.push(...events);
        if (events.length < PAGE) break;
        offset += PAGE;
      }
    }

    // Sort by date.entered descending (newest first)
    allMovements.sort((a, b) => {
      const da = a?._source?.date?.entered || '';
      const db = b?._source?.date?.entered || '';
      return db.localeCompare(da);
    });

    const movements = allMovements.map((m) => {
      const src = m._source || {};
      const parseTs = (raw) => {
        if (!raw) return null;
        const iso = String(raw).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
        try { return new Date(iso).toISOString(); } catch { return raw; }
      };
      return {
        zone_name: src.zone?.name || '(Unknown)',
        zone_id: src.zone?.id || null,
        entered: parseTs(src.date?.entered),
        left: parseTs(src.date?.left),
        created: parseTs(src.date?.created),
        asset_identifier: src.node?.asset_identifier || null,
        node_id: src.node?.id || null,
        application_code: src.application?.code || null,
      };
    });

    return Response.json({ device_id, count: movements.length, movements });
  } catch (error) {
    console.error(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});