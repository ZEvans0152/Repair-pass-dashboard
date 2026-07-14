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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { asset_id } = body;
        if (!asset_id) return Response.json({ error: 'asset_id is required' }, { status: 400 });

        const token = await getCognososToken();

        const appsRes = await fetch(`${API_BASE}/application`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!appsRes.ok) throw new Error(`Cognosos application fetch failed: ${appsRes.status}`);
        const appsData = await appsRes.json();
        const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);

        for (const app of apps) {
            const appCode = app.application_code || app.code || app.applicationCode;
            if (!appCode) continue;
            let offset = 0;
            const PAGE = 2000;
            while (true) {
                const nodesRes = await fetch(`${API_BASE}/node?application_code=${encodeURIComponent(appCode)}&limit=${PAGE}&offset=${offset}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!nodesRes.ok) break;
                const nodesData = await nodesRes.json();
                const nodes = Array.isArray(nodesData) ? nodesData : (nodesData.items || nodesData.data || nodesData.nodes || []);
                if (nodes.length === 0) break;
                const node = nodes.find((n) =>
                    String(n.asset_identifier) === String(asset_id) ||
                    String(n.id) === String(asset_id) ||
                    String(n.device_id) === String(asset_id)
                );
                if (node) {
                    if (body.probe) {
                        const results = {};
                        const candidates = [
                            `${API_BASE}/assetMovement?application_code=${encodeURIComponent(appCode)}&node_id=${node.id}&limit=5`,
                            `${API_BASE}/assetMovement?application_code=${encodeURIComponent(appCode)}&asset_identifier=${encodeURIComponent(node.asset_identifier)}&limit=5`,
                        ];
                        for (const url of candidates) {
                            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                            const text = await r.text();
                            results[url] = { status: r.status, body: text.slice(0, 2000) };
                        }
                        return Response.json({ found: true, node, probes: results });
                    }
                    return Response.json({ found: true, application_code: appCode, node });
                }
                if (nodes.length < PAGE) break;
                offset += PAGE;
            }
        }

        return Response.json({ found: false });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});