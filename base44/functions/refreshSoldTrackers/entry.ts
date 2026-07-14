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
  if (!clientId || !issuerUrl) throw new Error('Could not find client_id/issuer_url in config response');

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
  if (!authRes.ok) throw new Error(`Cognosos auth failed: ${authRes.status}`);
  const auth = await authRes.json();
  const idToken = auth?.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error('No IdToken in auth response');
  cachedToken = idToken;
  cachedTokenAt = Date.now();
  return idToken;
}

const FIELD_QUERIES = {
  sold_date: ['SaleDate'],
  buyer: ['Buyer Name'],
  vin: ['VIN'],
  year: ['Year'],
  make: ['Make'],
  model: ['Model'],
};

async function queryOneField(headers, appCode, nodeId, fieldNames) {
  for (const name of fieldNames) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `${API_BASE}/customFieldValue?application_code=${encodeURIComponent(appCode)}&node_id=${nodeId}&custom_field_name=${encodeURIComponent(name)}`,
        { headers, signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const vals = await res.json();
        if (vals?.[0]?.value != null && String(vals[0].value).trim() !== '') {
          return String(vals[0].value).trim();
        }
      }
    } catch { /* try next variant */ }
  }
  return null;
}

// Query all fields for one node in parallel
async function queryNodeFields(headers, appCode, nodeId) {
  const entries = Object.entries(FIELD_QUERIES);
  const results = await Promise.all(
    entries.map(([key, names]) => queryOneField(headers, appCode, nodeId, names))
  );
  const out = {};
  entries.forEach(([key], i) => { out[key] = results[i]; });
  return out;
}

// Get the latest Left Lot movement timestamp + whether the vehicle already exited it.
// Returns { entered: ISO|null, hasExited: bool } or null if API failed.
// hasExited=true means the vehicle entered Left Lot but later left it (came back).
async function getLeftLotMovement(headers, appCode, nodeId) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${API_BASE}/assetMovement?application_code=${encodeURIComponent(appCode)}&node_id=${nodeId}&limit=1`,
      { headers, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return { entered: null, hasExited: false };
    const data = await res.json();
    const events = Array.isArray(data) ? data : (data.items || []);
    for (const evt of events) {
      const src = evt._source || {};
      const zoneName = src.zone?.name || '';
      if (/left\s*(lot|site)/i.test(zoneName) && src.date?.entered) {
        const raw = String(src.date.entered);
        const iso = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
        return { entered: new Date(iso).toISOString(), hasExited: !!src.date.left };
      }
    }
    return { entered: null, hasExited: false };
  } catch {
    return { entered: null, hasExited: false };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = await getCognososToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Get applications
    const appsRes = await fetch(`${API_BASE}/application`, { headers });
    if (!appsRes.ok) throw new Error(`Cognosos application fetch failed: ${appsRes.status}`);
    const appsData = await appsRes.json();
    const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);

    // Load RepairPasses for stock number lookup
    const passes = await base44.asServiceRole.entities.RepairPass.filter({ archived: false }, '', 10000);
    const passByAssetId = new Map();
    const passByStock = new Map();
    for (const p of passes) {
      if (p.cognosos_asset_id) passByAssetId.set(String(p.cognosos_asset_id), p);
      if (p.stock_number) passByStock.set(String(p.stock_number), p);
    }

    // Step 1: collect candidate nodes (Left Lot or Left Site)
    // Also index all nodes by device_id for detachment status syncing
    const candidates = [];
    const nodeByDevice = new Map(); // device_id → node (for detachment check)
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

        for (const node of nodes) {
          if (node.device_id != null) nodeByDevice.set(String(node.device_id), node);
          const zone = node.current_zone_text || '';
          if (/left\s*(lot|site)/i.test(zone)) {
            candidates.push(node);
          }
        }
        if (nodes.length < PAGE) break;
        offset += PAGE;
      }
    }
    console.log(`Found ${candidates.length} candidate nodes that left lot/site`);

    const MAX_CANDIDATES = 2000;
    const toCheck = candidates.slice(0, MAX_CANDIDATES);

    // Step 2: batch query all custom fields
    const BATCH_SIZE = 10;
    const results = [];

    for (const app of apps) {
      const appCode = app.application_code || app.code || app.applicationCode;
      if (!appCode) continue;

      const appCandidates = toCheck.filter((n) => {
        const nApp = n.application?.code || n.application_code || '';
        return nApp === appCode;
      });
      if (appCandidates.length === 0) continue;

      for (let i = 0; i < appCandidates.length; i += BATCH_SIZE) {
        const batch = appCandidates.slice(i, i + BATCH_SIZE);
        const [fieldResults, movementResults] = await Promise.all([
          Promise.all(batch.map((node) => queryNodeFields(headers, appCode, node.id))),
          Promise.all(batch.map((node) => getLeftLotMovement(headers, appCode, node.id))),
        ]);

        for (let j = 0; j < batch.length; j++) {
          const node = batch[j];
          const fields = fieldResults[j];
          if (!fields.sold_date || !fields.buyer) continue;

          const mov = movementResults[j];
          // Skip vehicles whose latest movement is NOT a Left Lot event —
          // they're moving around the lot (false positive: node.current_zone_text
          // is stale but actual movement data shows a different zone).
          // Also skip those whose Left Lot movement already has an exit —
          // they came back (e.g., dealer test drive), not truly sold & gone.
          if (!mov || !mov.entered || mov.hasExited) continue;

          const assetId = String(node.asset_identifier || '');
          const pass = passByAssetId.get(assetId) || passByStock.get(assetId) || null;

          // Use assetMovement date.entered as left_date (when vehicle entered Left Lot zone).
          const leftDate = mov.entered;

          const record = {
            device_id: String(node.device_id || node.id || ''),
            asset_identifier: assetId,
            sold_date: fields.sold_date,
            left_date: leftDate,
            buyer: fields.buyer,
            latitude: node.latitude != null ? Number(node.latitude) : null,
            longitude: node.longitude != null ? Number(node.longitude) : null,
            zone: 'Left Lot',
            vin: fields.vin || (pass?.vin || null),
            year: fields.year || (pass?.year || null),
            make: fields.make || (pass?.make || null),
            model: fields.model || (pass?.model || null),
            color: pass?.color || null,
            client: pass?.client || null,
            stock_number: pass?.stock_number || null,
          };

          results.push(record);
        }
        console.log(`Batch ${i / BATCH_SIZE + 1}: found ${results.length} sold so far`);
      }
    }

    console.log(`Total sold trackers identified: ${results.length}`);

    // Smart sync: create new + remove stragglers + refresh timestamps on existing
    const existing = await base44.asServiceRole.entities.SoldTracker.list('', 10000);
    const existingByDevice = new Map();
    for (const r of existing) {
      existingByDevice.set(r.device_id, r);
    }

    // Build a map of device_id → fresh left_date for quick lookup during updates
    const freshLeftDate = new Map();
    for (const r of results) {
      if (r.left_date) freshLeftDate.set(r.device_id, r.left_date);
    }

    const resultDeviceIds = new Set(results.map(r => r.device_id));
    let deleted = 0;
    let created = 0;
    let refreshed = 0;

    // Delete records whose device_id is no longer in results
    for (const [deviceId, r] of existingByDevice) {
      if (!resultDeviceIds.has(deviceId)) {
        await base44.asServiceRole.entities.SoldTracker.delete(r.id);
        deleted++;
      }
    }

    // Create only new records (device_id not already tracked)
    const newRecords = results.filter(r => !existingByDevice.has(r.device_id));
    for (let i = 0; i < newRecords.length; i += 100) {
      await base44.asServiceRole.entities.SoldTracker.bulkCreate(newRecords.slice(i, i + 100));
      created += newRecords.slice(i, i + 100).length;
    }

    // Refresh left_date on existing records when we now have a movement timestamp
    // (fixes stale sold_date fallback from previous syncs)
    for (const [deviceId, r] of existingByDevice) {
      const fresh = freshLeftDate.get(deviceId);
      if (fresh && r.left_date !== fresh) {
        await base44.asServiceRole.entities.SoldTracker.update(r.id, { left_date: fresh });
        refreshed++;
      }
    }

    return Response.json({
      synced: created,
      deleted,
      refreshed,
      unchanged: existing.length - deleted - refreshed,
      candidates_checked: toCheck.length,
      total_candidates: candidates.length
    });
  } catch (error) {
    console.error(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});