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

// Map of Cognosos custom field name -> our form field
const FIELD_MAP = {
    VIN: 'vin',
    Make: 'make',
    Model: 'model',
    ConsignorName: 'client',
    Year: 'year',
    Color: 'color',
    Mileage: 'mileage',
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        void base44;

        const body = await req.json();
        const stockNumber = String(body.stock_number || '').trim();
        if (!stockNumber) return Response.json({ error: 'stock_number is required' }, { status: 400 });

        const token = await getCognososToken();
        const headers = { Authorization: `Bearer ${token}` };

        const appsRes = await fetch(`${API_BASE}/application`, { headers });
        if (!appsRes.ok) throw new Error(`Cognosos application fetch failed: ${appsRes.status}`);
        const appsData = await appsRes.json();
        const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);

        for (const app of apps) {
            const appCode = app.application_code || app.code || app.applicationCode;
            if (!appCode) continue;

            // Find the node by stock number (asset identifier)
            let node = null;
            let offset = 0;
            const PAGE = 2000;
            while (!node) {
                const nodesRes = await fetch(`${API_BASE}/node?application_code=${encodeURIComponent(appCode)}&limit=${PAGE}&offset=${offset}`, { headers });
                if (!nodesRes.ok) break;
                const nodesData = await nodesRes.json();
                const nodes = Array.isArray(nodesData) ? nodesData : (nodesData.items || nodesData.data || nodesData.nodes || []);
                if (nodes.length === 0) break;
                node = nodes.find((n) => String(n.asset_identifier) === stockNumber) || null;
                if (nodes.length < PAGE) break;
                offset += PAGE;
            }
            if (!node) continue;

            // Fetch the vehicle attributes from custom field values
            const vehicle = {};
            await Promise.all(Object.entries(FIELD_MAP).map(async ([cognososName, ourKey]) => {
                const res = await fetch(`${API_BASE}/customFieldValue?application_code=${encodeURIComponent(appCode)}&node_id=${node.id}&custom_field_name=${encodeURIComponent(cognososName)}`, { headers });
                if (!res.ok) return;
                const vals = await res.json();
                const value = vals?.[0]?.value;
                if (value != null && String(value).trim() !== '') vehicle[ourKey] = String(value).trim();
            }));

            return Response.json({ found: true, vehicle });
        }

        return Response.json({ found: false });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});