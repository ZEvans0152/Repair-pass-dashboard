import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const API_BASE = 'https://api.cognosos.net';

// Cache the Cognosos token across invocations of a warm instance —
// Cognito ID tokens are valid for ~1 hour.
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

async function getCognososToken() {
    if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;

    // Step 1: get idp config (client_id + issuer_url)
    const configRes = await fetch(`${API_BASE}/config?category=idp`);
    if (!configRes.ok) throw new Error(`Cognosos config fetch failed: ${configRes.status} ${await configRes.text()}`);
    const config = await configRes.json();
    const clientId = config?.idp?.client_id;
    const issuerUrl = config?.idp?.issuer_url;
    if (!clientId || !issuerUrl) throw new Error('Could not find client_id/issuer_url in config response');

    // Step 2: Cognito InitiateAuth
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
    if (!authRes.ok) throw new Error(`Cognosos auth failed: ${authRes.status} ${await authRes.text()}`);
    const auth = await authRes.json();
    const idToken = auth?.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error('No IdToken in auth response: ' + JSON.stringify(auth));
    cachedToken = idToken;
    cachedTokenAt = Date.now();
    return idToken;
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Zones like "Left Lot" / "Left Site" mean the vehicle is OFF the lot
export function isOffLotZone(zoneName) {
    return /left\s*(lot|site)/i.test(zoneName || '');
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Pure decision logic for one pass: given the pass, its Cognosos node, the
// latest movement event, and the lot center, compute the entity update and
// whether a departed/returned notification fires. Exported for unit tests.
export function computeSyncChanges({ pass, node, movement, lotLat, lotLng, now }) {
    let zone = node.current_zone_text || '';
    // Node endpoint sometimes reports an empty zone — fall back to the latest
    // movement event: if the asset hasn't left that zone, it's still in it.
    // Never use an off-lot movement event as the zone fallback — stale "Left Lot"
    // events can falsely trigger departures. Departures must come from the
    // node's own current_zone_text.
    if (!zone && movement && !movement.date?.left && !isOffLotZone(movement.zone?.name)) {
        zone = movement.zone?.name || '';
    }
    // If no zone is reported at all, assume the vehicle is still on the lot
    const explicitlyOffLot = isOffLotZone(zone);
    const onLot = !explicitlyOffLot;
    // No zone reported but GPS is near the lot center => label it "On Lot".
    // Only for vehicles already believed on the lot — GPS can be stale for out vehicles.
    if (zone === '' && (pass.status === 'pending_departure' || pass.status === 'returned') &&
        lotLat != null && lotLng != null &&
        node.latitude != null && node.longitude != null &&
        distanceMeters(Number(node.latitude), Number(node.longitude), lotLat, lotLng) <= 1200) {
        zone = 'On Lot';
    }
    const changes = {
        current_zone: zone,
        last_location_update: now,
    };
    if (node.latitude != null && node.longitude != null) {
        changes.current_lat = Number(node.latitude);
        changes.current_lng = Number(node.longitude);
    }

    const movementTime = movement?.date?.entered ? new Date(movement.date.entered).toISOString() : null;
    // Only trust the movement event's timestamp when it matches the transition:
    // a departure should come from an off-lot zone event, a return from an on-lot one.
    const movementIsOffLot = isOffLotZone(movement?.zone?.name);

    // GPS cross-check: true/false when both tracker GPS and lot center are known, null = unknown
    let gpsNearLot = null;
    if (lotLat != null && lotLng != null && node.latitude != null && node.longitude != null) {
        gpsNearLot = distanceMeters(Number(node.latitude), Number(node.longitude), lotLat, lotLng) <= 1200;
    }

    // Detect the desired transition this sync
    let desired = null;
    if (!onLot && pass.status === 'pending_departure') {
        desired = 'departed';
    } else if (onLot && zone !== '' && gpsNearLot !== false &&
        (pass.status === 'out' || pass.status === 'sent_for_pickup')) {
        // An empty zone is ambiguous (tracker may simply not be reporting a zone),
        // so a return requires a real named on-lot zone AND, when GPS is available,
        // the tracker must actually be near the lot.
        // Stale GPS can still re-trigger lot zones, so when movement history exists
        // it must corroborate: the latest movement event must be an entry into a
        // named on-lot zone that happened after the vehicle departed.
        const movementConfirmsReturn = !movement ||
            (movementTime && !movementIsOffLot && (!pass.departure_time || movementTime > pass.departure_time));
        if (movementConfirmsReturn) desired = 'returned';
    }

    // Require the same transition on two consecutive syncs before committing
    let notificationType = null;
    if (desired && pass.pending_transition === desired) {
        changes.pending_transition = '';
        if (desired === 'departed') {
            changes.status = 'out';
            changes.departure_time = (movementTime && movementIsOffLot) ? movementTime : now;
        } else {
            changes.status = 'returned';
            const validReturnTime = movementTime && !movementIsOffLot &&
                (!pass.departure_time || movementTime > pass.departure_time);
            changes.return_time = validReturnTime ? movementTime : now;
        }
        notificationType = desired;
    } else {
        changes.pending_transition = desired || '';
    }

    return { changes, notificationType };
}

// A write can be skipped when nothing substantive changed and the stored
// last_location_update is still fresh — cuts most DB writes on quiet syncs.
export function canSkipWrite(pass, changes, notificationType, now, freshMs = 15 * 60 * 1000) {
    if (notificationType) return false;
    if ('status' in changes || 'no_tracker' in changes) return false;
    if ((changes.current_zone || '') !== (pass.current_zone || '')) return false;
    if ((changes.pending_transition || '') !== (pass.pending_transition || '')) return false;
    if ('current_lat' in changes &&
        (changes.current_lat !== pass.current_lat || changes.current_lng !== pass.current_lng)) return false;
    if (!pass.last_location_update) return false;
    return new Date(now).getTime() - new Date(pass.last_location_update).getTime() < freshMs;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let body = {};
        try { body = await req.json() || {}; } catch { /* no body */ }

        const token = await getCognososToken();

        // Get applications for this customer
        const appsRes = await fetch(`${API_BASE}/application`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!appsRes.ok) throw new Error(`Cognosos application fetch failed: ${appsRes.status} ${await appsRes.text()}`);
        const appsData = await appsRes.json();
        const apps = Array.isArray(appsData) ? appsData : (appsData.items || appsData.data || appsData.applications || []);
        console.log(`Fetched ${apps.length} applications. Sample:`, JSON.stringify(apps[0] || null));

        // Fetch nodes for each application
        const nodes = [];
        for (const app of apps) {
            const appCode = app.application_code || app.code || app.applicationCode;
            if (!appCode) continue;
            let offset = 0;
            const PAGE = 2000;
            while (true) {
                const nodesRes = await fetch(`${API_BASE}/node?application_code=${encodeURIComponent(appCode)}&limit=${PAGE}&offset=${offset}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!nodesRes.ok) {
                    console.log(`Node fetch failed for app ${appCode}: ${nodesRes.status} ${await nodesRes.text()}`);
                    break;
                }
                const nodesData = await nodesRes.json();
                const appNodes = Array.isArray(nodesData) ? nodesData : (nodesData.items || nodesData.data || nodesData.nodes || []);
                if (appNodes.length === 0) break;
                nodes.push(...appNodes);
                if (appNodes.length < PAGE) break;
                offset += PAGE;
            }
        }
        console.log(`Fetched ${nodes.length} nodes. Sample:`, JSON.stringify(nodes[0] || null));

        // Index nodes by possible asset identifiers
        const nodeMap = new Map();
        for (const n of nodes) {
            for (const key of [n.asset_identifier, n.id, n.device_id]) {
                if (key != null) nodeMap.set(String(key), n);
            }
        }

        // Update all non-archived repair passes — single list call, filter in memory
        const allActive = ['pending_departure', 'out', 'sent_for_pickup', 'returned'];
        const allPasses = await base44.asServiceRole.entities.RepairPass.list('', 10000);
        let passes = allPasses.filter(p => allActive.includes(p.status) && !p.archived && !p.exclude_from_sync);
        // Targeted mode: sync just one pass (used right after creating a pass)
        if (body.only_pass_id) {
            passes = passes.filter(p => p.id === body.only_pass_id);
        }

        // Resolve each pass's node: stock number first, then VIN, then stored asset ID
        function resolveNode(p) {
            return nodeMap.get(String(p.stock_number)) || nodeMap.get(String(p.vin)) ||
                (p.cognosos_asset_id ? nodeMap.get(String(p.cognosos_asset_id)) : null);
        }

        // Keep the linked asset ID up to date
        for (const p of passes) {
            const match = resolveNode(p);
            if (match && String(match.asset_identifier) !== String(p.cognosos_asset_id || '')) {
                p.cognosos_asset_id = String(match.asset_identifier);
                await base44.asServiceRole.entities.RepairPass.update(p.id, { cognosos_asset_id: p.cognosos_asset_id });
            }
        }

        // Get the asset's latest movement event (zone entered/left info)
        async function getLastMovement(node) {
            const appCode = node.application?.code;
            if (!appCode) return null;
            const res = await fetch(`${API_BASE}/assetMovement?application_code=${encodeURIComponent(appCode)}&node_id=${node.id}&limit=1`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return null;
            const events = await res.json();
            return events?.[0]?._source || null;
        }

        // Lot center for GPS fallback when no zone is reported
        const settingsList = await base44.asServiceRole.entities.AppSettings.list();
        const lotLat = settingsList[0]?.lot_lat;
        const lotLng = settingsList[0]?.lot_lng;
        const alertEmail = settingsList[0]?.alert_email;

        let updated = 0;
        let skipped = 0;
        const now = new Date().toISOString();
        for (const p of passes) {
            const node = resolveNode(p);

            if (!node) {
                if (!p.cognosos_asset_id) {
                    // Never found in Cognosos => assume no tracker on this unit
                    if (!p.no_tracker) {
                        await base44.asServiceRole.entities.RepairPass.update(p.id, { no_tracker: true });
                        updated++;
                    }
                    continue;
                }
                // Tracker detached / asset no longer reporting => vehicle has left
                if (p.status === 'pending_departure') {
                    // Require the same signal on two consecutive syncs before committing
                    if (p.pending_transition !== 'departed') {
                        await base44.asServiceRole.entities.RepairPass.update(p.id, { pending_transition: 'departed' });
                        continue;
                    }
                    await base44.asServiceRole.entities.RepairPass.update(p.id, {
                        status: 'out',
                        departure_time: now,
                        current_zone: '',
                        pending_transition: '',
                    });
                    updated++;
                    const vehicleName = `${p.make} ${p.model}`;
                    await base44.asServiceRole.entities.Notification.create({
                        type: 'departed',
                        repair_pass_id: p.id,
                        title: `${vehicleName} departed`,
                        message: `${vehicleName} (${p.vin}) has left the lot.`,
                    });
                }
                continue;
            }

            const movement = await getLastMovement(node);
            const { changes, notificationType } = computeSyncChanges({
                pass: p, node, movement, lotLat, lotLng, now,
            });

            if (p.no_tracker) {
                changes.no_tracker = false;
                // Send email alert: tracker found for a previously tracker-less vehicle
                try {
                    if (alertEmail) {
                        const vehicleName = `${p.year || ''} ${p.make} ${p.model}`.trim();
                        const html = `
                        <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
                          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
                            <div style="background:#1e2a4a;padding:20px 24px;">
                              <span style="color:#ffffff;font-size:16px;font-weight:bold;">CAA Vehicle Dispatch</span>
                            </div>
                            <div style="padding:24px;">
                              <span style="display:inline-block;background:#0ea5e91A;color:#0ea5e9;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">Tracker Attached</span>
                              <h1 style="font-size:20px;color:#0f172a;margin:14px 0 6px;">Tracker detected on ${escapeHtml(vehicleName)}</h1>
                              <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.5;">A GPS tracker has been detected on a vehicle that was previously listed as having no tracker.</p>
                              <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">
                                <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">Vehicle</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(vehicleName)}</td></tr>
                                <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">Stock #</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(p.stock_number)}</td></tr>
                                <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">VIN</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(p.vin)}</td></tr>
                                <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">Client</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(p.client || '—')}</td></tr>
                                <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;white-space:nowrap;">Tracker ID</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(node.asset_identifier || node.id || '—')}</td></tr>
                              </table>
                            </div>
                            <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                              <p style="font-size:12px;color:#94a3b8;margin:0;">This is an automated alert from CAA Vehicle Dispatch.</p>
                            </div>
                          </div>
                        </div>`;
                        await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                from: 'CAA Vehicle Dispatch <alerts@repairpasscarolinaautoauction.info>',
                                to: alertEmail.split(',').map(e => e.trim()).filter(Boolean),
                                subject: `Tracker Attached: ${vehicleName} — Stock #${p.stock_number}`,
                                html,
                            }),
                        });
                    }
                } catch (emailErr) {
                    console.log('Tracker-found email failed:', emailErr.message);
                }
            }

            // Nothing substantive changed and the timestamp is fresh => skip the write
            if (canSkipWrite(p, changes, notificationType, now)) {
                skipped++;
                continue;
            }

            await base44.asServiceRole.entities.RepairPass.update(p.id, changes);
            updated++;

            if (notificationType) {
                const vehicleName = `${p.make} ${p.model}`;
                await base44.asServiceRole.entities.Notification.create({
                    type: notificationType,
                    repair_pass_id: p.id,
                    title: notificationType === 'departed'
                        ? `${vehicleName} departed`
                        : `${vehicleName} returned`,
                    message: notificationType === 'departed'
                        ? `${vehicleName} (${p.vin}) has left the lot.`
                        : `${vehicleName} (${p.vin}) has returned to the lot.`,
                });
            }
        }

        const responseBody = { nodesFetched: nodes.length, passesTracked: passes.length, updated, skipped };
        if (body.debug === true) responseBody.sampleNode = nodes[0] || null;
        return Response.json(responseBody);
    } catch (error) {
        console.error(error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
