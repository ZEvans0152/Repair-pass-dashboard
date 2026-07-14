import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function reportErrorHref(vehicle, stock, vin) {
    const subject = `Error Report: ${vehicle} — Stock #${stock || '?'}`;
    const body = `Vehicle: ${vehicle}\nStock #: ${stock || ''}\nVIN: ${vin || ''}\n\nDescribe the error:\n`;
    return `mailto:zevans@carolinaautoauction.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildEmailHtml({ accentColor, badgeText, title, intro, rows, mapUrl, reportHref }) {
    const rowsHtml = rows
        .filter(([, v]) => v)
        .map(([label, value]) => `
            <tr>
                <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${escapeHtml(label)}</td>
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(value)}</td>
            </tr>`).join('');

    return `
    <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:#1e2a4a;padding:20px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:bold;">CAA Vehicle Dispatch</span>
        </div>
        <div style="padding:24px;">
          <span style="display:inline-block;background:${accentColor}1A;color:${accentColor};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${badgeText}</span>
          <h1 style="font-size:20px;color:#0f172a;margin:14px 0 6px;">${escapeHtml(title)}</h1>
          <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.5;">${escapeHtml(intro)}</p>
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
        let pass = payload.data;
        const oldStatus = payload.old_data?.status;

        if (!pass && payload.payload_too_large) {
            pass = await base44.asServiceRole.entities.RepairPass.get(payload.event.entity_id);
        }
        if (!pass) return Response.json({ skipped: 'no data' });

        const newStatus = pass.status;
        const isDeparture = newStatus === 'out' && oldStatus !== 'out' && oldStatus !== 'overdue';
        const isReturn = newStatus === 'returned' && oldStatus !== 'returned';
        const isPickup = newStatus === 'sent_for_pickup' && oldStatus !== 'sent_for_pickup';
        if (!isDeparture && !isReturn && !isPickup) {
            return Response.json({ skipped: 'status change not departure/return/pickup' });
        }

        const settingsList = await base44.asServiceRole.entities.AppSettings.list();
        const alertEmail = settingsList[0]?.alert_email;
        if (!alertEmail) return Response.json({ skipped: 'no alert email configured' });

        let subject, accentColor, badgeText, title, intro;
        const mapUrl = pass.current_lat != null && pass.current_lng != null
            ? `https://www.google.com/maps?q=${pass.current_lat},${pass.current_lng}`
            : null;

        if (isPickup) {
            subject = `Bring Back Request: ${pass.year || ''} ${pass.make} ${pass.model} — Stock #${pass.stock_number}`;
            accentColor = '#7c3aed';
            badgeText = 'Bring Back Requested';
            title = `${pass.year || ''} ${pass.make} ${pass.model} ready for bring back`;
            intro = 'A vehicle has been marked for bring back. Please arrange transport.';
        } else if (isDeparture) {
            subject = `Vehicle Departed Lot: ${pass.make} ${pass.model} - Stock #${pass.stock_number}`;
            accentColor = '#ea580c';
            badgeText = 'Departed Lot';
            title = `${pass.make} ${pass.model} has left the lot`;
            intro = 'A vehicle has departed on a repair pass. Details are below.';
        } else {
            subject = `Vehicle Returned to Lot: ${pass.make} ${pass.model} - Stock #${pass.stock_number}`;
            accentColor = '#16a34a';
            badgeText = 'Returned to Lot';
            title = `${pass.make} ${pass.model} is back on the lot`;
            intro = 'A vehicle has returned from its repair pass. Details are below.';
        }

        const html = buildEmailHtml({
            accentColor,
            badgeText,
            title,
            intro,
            rows: isPickup ? [
                ['Dealership', pass.dealership],
                ['Address', pass.dealership_address],
                ['Client', pass.client],
                ['Year', pass.year],
                ['Make', pass.make],
                ['Model', pass.model],
                ['Color', pass.color],
                ['VIN', pass.vin],
                ['Stock #', pass.stock_number],
            ] : [
                ['Vehicle', `${pass.make} ${pass.model}`],
                ['Stock #', pass.stock_number],
                ['VIN', pass.vin],
                ['Client', pass.client],
                ['Dealership', pass.dealership],
                ['Reason', pass.reason],
                isDeparture && pass.departure_time ? ['Departed', new Date(pass.departure_time).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'] : [null, null],
                isReturn && pass.return_time ? ['Returned', new Date(pass.return_time).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'] : [null, null],
                ['Zone', pass.current_zone],
            ].filter(([l]) => l),
            mapUrl,
            reportHref: reportErrorHref(`${pass.year || ''} ${pass.make} ${pass.model}`.trim(), pass.stock_number, pass.vin),
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

        const type = isPickup ? 'bring_back' : isDeparture ? 'departure' : 'return';
        return Response.json({ sent: true, type });
    } catch (error) {
        console.error(error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});