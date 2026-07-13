import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function reportErrorHref(vehicle, stock, vin) {
    const subject = `Error Report: ${vehicle} — Stock #${stock || '?'}`;
    const body = `Vehicle: ${vehicle}\nStock #: ${stock || ''}\nVIN: ${vin || ''}\n\nDescribe the error:\n`;
    return `mailto:zevans@carolinaautoauction.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildEmailHtml({ title, intro, rows, mapUrl, reportHref }) {
    const rowsHtml = rows
        .filter(([, v]) => v)
        .map(([label, value]) => `
            <tr>
                <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${label}</td>
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${value}</td>
            </tr>`).join('');

    return `
    <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:#1e2a4a;padding:20px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:bold;">CAA Vehicle Dispatch</span>
        </div>
        <div style="padding:24px;">
          <span style="display:inline-block;background:#dc26261A;color:#dc2626;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">Sold \u2014 Left Lot with Tracker</span>
          <h1 style="font-size:20px;color:#0f172a;margin:14px 0 6px;">${title}</h1>
          <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.5;">${intro}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">
            ${rowsHtml}
          </table>
          ${mapUrl ? `
          <div style="text-align:center;margin-top:20px;">
            <a href="${mapUrl}" style="display:inline-block;background:#1e2a4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;">View Location on Map</a>
          </div>` : ''}
        </div>
        <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="font-size:12px;color:#94a3b8;margin:0;">This is an automated alert from CAA Vehicle Dispatch.</p>
          ${reportHref ? `<p style="font-size:12px;color:#64748b;margin:8px 0 0;">See an error with this vehicle's info? <a href="${reportHref}" style="color:#1e2a4a;font-weight:bold;">Report an Error</a></p>` : ''}
        </div>
      </div>
    </div>`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        let tracker = payload.data;
        if (!tracker && payload.payload_too_large) {
            tracker = await base44.asServiceRole.entities.SoldTracker.get(payload.event.entity_id);
        }
        if (!tracker) return Response.json({ skipped: 'no data' });

        const settingsList = await base44.asServiceRole.entities.AppSettings.list();
        const alertEmail = settingsList[0]?.alert_email;
        if (!alertEmail) return Response.json({ skipped: 'no alert email configured' });

        const vehicleName = [tracker.year, tracker.make, tracker.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
        const leftTime = tracker.left_date
            ? new Date(tracker.left_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' ET'
            : 'Unknown';

        const subject = `Vehicle Sold & Left Lot with Tracker: ${vehicleName} — Stock #${tracker.stock_number || tracker.asset_identifier || '?'}`;

        const mapUrl = tracker.latitude != null && tracker.longitude != null
            ? `https://www.google.com/maps?q=${tracker.latitude},${tracker.longitude}`
            : null;

        const html = buildEmailHtml({
            title: `${vehicleName} has been sold and left the lot with a tracker`,
            intro: 'A sold vehicle has departed the lot with a tracker. Details are below.',
            rows: [
                ['Year', tracker.year],
                ['Make', tracker.make],
                ['Model', tracker.model],
                ['Color', tracker.color],
                ['VIN', tracker.vin],
                ['Stock #', tracker.stock_number || tracker.asset_identifier],
                ['Buyer', tracker.buyer],
                ['Left Lot', leftTime],
                ['Sold Date', tracker.sold_date],
                ['Client', tracker.client],
            ],
            mapUrl,
            reportHref: reportErrorHref(vehicleName, tracker.stock_number || tracker.asset_identifier, tracker.vin),
        });

        const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'CAA Vehicle Dispatch <alerts@repairpasscarolinaautoauction.info>',
                to: alertEmail.split(',').map(e => e.trim()).filter(Boolean),
                subject,
                html,
            }),
        });
        if (!resendRes.ok) throw new Error(`Resend failed: ${resendRes.status} ${await resendRes.text()}`);

        return Response.json({ sent: true, vehicle: vehicleName });
    } catch (error) {
        console.error(error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});