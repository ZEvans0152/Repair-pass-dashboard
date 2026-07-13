import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const API_BASE = 'https://api.cognosos.net';

async function getCognososToken() {
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
  return idToken;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = await getCognososToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Get all applications
    const appsRes = await fetch(`${API_BASE}/application`, { headers });
    if (!appsRes.ok) throw new Error(`Cognosos application fetch failed: ${appsRes.status}`);
    const appsData = await appsRes.json();
    const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);

    // Fetch all devices across all applications
    const allDevices = [];
    for (const app of apps) {
      const appCode = app.application_code || app.code || app.applicationCode;
      if (!appCode) continue;
      let offset = 0;
      const LIMIT = 500;
      while (true) {
        const devRes = await fetch(
          `${API_BASE}/device?application_code=${encodeURIComponent(appCode)}&limit=${LIMIT}&offset=${offset}`,
          { headers }
        );
        if (!devRes.ok) break;
        const devData = await devRes.json();
        const devices = Array.isArray(devData) ? devData : (devData.items || devData.data || devData.devices || []);
        if (devices.length === 0) break;
        allDevices.push(...devices);
        offset += devices.length;
      }
    }

    // Filter for low battery
    const lowBatteryDevices = allDevices.filter((d) => {
      const battery = d.battery_level ?? d.battery ?? d.battery_percentage ?? d.charge ?? d.batteryLevel;
      if (battery == null) return false;
      return Number(battery) <= 20;
    });

    // Fetch all nodes for GPS/zone data and asset matching
    const nodeMap = new Map();
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
        for (const n of nodes) {
          if (n.device_id != null) nodeMap.set(String(n.device_id), n);
          if (n.asset_identifier != null && !nodeMap.has('asset:' + String(n.asset_identifier))) {
            nodeMap.set('asset:' + String(n.asset_identifier), n);
          }
        }
        if (nodes.length < PAGE) break;
        offset += PAGE;
      }
    }

    // Load all RepairPasses for cross-referencing
    const passes = await base44.asServiceRole.entities.RepairPass.filter(
      { archived: false },
      '',
      10000
    );

    const passByAssetId = new Map();
    const passByStock = new Map();
    const passByVin = new Map();
    for (const p of passes) {
      if (p.cognosos_asset_id) passByAssetId.set(String(p.cognosos_asset_id), p);
      if (p.stock_number) passByStock.set(String(p.stock_number), p);
      if (p.vin) passByVin.set(String(p.vin), p);
    }

    // Build result list
    const results = lowBatteryDevices.map((device) => {
      const battery = Number(
        device.battery_level ?? device.battery ?? device.battery_percentage ?? device.charge ?? device.batteryLevel ?? 0
      );
      const deviceId = device.device_id || device.id || device.serial_number || 'Unknown';

      const node = deviceId !== 'Unknown' ? nodeMap.get(String(deviceId)) : null;
      const assetId = node ? String(node.asset_identifier || '') : '';

      const attachedPass =
        (assetId ? passByAssetId.get(assetId) : null) ||
        (assetId ? passByStock.get(assetId) : null) ||
        (assetId ? passByVin.get(assetId) : null) ||
        null;

      const item = {
        device_id: String(deviceId),
        battery_level: battery,
        battery_status: device.battery_status ?? null,
        attached: !!attachedPass,
        latitude: node?.latitude != null ? Number(node.latitude) : null,
        longitude: node?.longitude != null ? Number(node.longitude) : null,
        zone: node?.current_zone_text || '',
      };

      if (attachedPass) {
        if (attachedPass.vin) item.vin = attachedPass.vin;
        if (attachedPass.stock_number) item.stock_number = attachedPass.stock_number;
        if (attachedPass.year) item.year = attachedPass.year;
        if (attachedPass.make) item.make = attachedPass.make;
        if (attachedPass.model) item.model = attachedPass.model;
      }

      return item;
    });

    results.sort((a, b) => a.battery_level - b.battery_level);

    return Response.json({ trackers: results, total: results.length });
  } catch (error) {
    console.error(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});