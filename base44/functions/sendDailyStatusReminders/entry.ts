import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// API date strings may lack a timezone marker — treat them as UTC
function parseUTC(dateStr) {
    if (typeof dateStr === 'string' && !/Z|[+-]\d{2}:?\d{2}$/.test(dateStr)) {
        return new Date(dateStr + 'Z');
    }
    return new Date(dateStr);
}

function daysSince(dateStr) {
    return Math.max(0, Math.floor((Date.now() - parseUTC(dateStr).getTime()) / 86400000));
}

function formatET(dateStr) {
    return parseUTC(dateStr).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) + ' ET';
}

function vehicleRowHtml(v, detail) {
    const name = `${v.year || ''} ${v.make} ${v.model}`.trim();
    return `
        <tr>
            <td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${name}</td>
            <td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${v.stock_number || '—'}</td>
            <td style="padding:10px 16px;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${v.dealership || '—'}</td>
            <td style="padding:10px 16px;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${detail}</td>
        </tr>`;
}

function sectionHtml({ accentColor, badgeText, intro, detailHeader, rows }) {
    if (!rows.length) return '';
    return `
        <div style="margin-bottom:28px;">
          <span style="display:inline-block;background:${accentColor}1A;color:${accentColor};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${badgeText}</span>
          <p style="font-size:14px;color:#475569;margin:10px 0 12px;line-height:1.5;">${intro}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">
            <tr>
              <th style="padding:8px 16px;font-size:12px;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;background:#f8fafc;">Vehicle</th>
              <th style="padding:8px 16px;font-size:12px;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;background:#f8fafc;">Stock #</th>
              <th style="padding:8px 16px;font-size:12px;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;background:#f8fafc;">Dealership</th>
              <th style="padding:8px 16px;font-size:12px;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;background:#f8fafc;">${detailHeader}</th>
            </tr>
            ${rows.join('')}
          </table>
        </div>`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        if (!(await base44.auth.isAuthenticated())) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const settings = (await base44.asServiceRole.entities.AppSettings.list())[0];
        const recipients = (settings?.alert_email || '').split(',').map(e => e.trim()).filter(Boolean);
        if (recipients.length === 0) {
            return Response.json({ error: 'No alert email configured in Settings' }, { status: 400 });
        }

        // 1. Pending departure for 3+ days
        const pending = await base44.asServiceRole.entities.RepairPass.filter({ status: 'pending_departure' });
        const pendingRows = pending
            .filter(v => daysSince(v.created_date) >= 3)
            .map(v => vehicleRowHtml(v, `${daysSince(v.created_date)} day(s) pending — added ${formatET(v.created_date)}`));

        // 2. Sent for pickup 3+ days ago, not yet returned
        const sentForPickup = await base44.asServiceRole.entities.RepairPass.filter({ status: 'sent_for_pickup' });
        const pickupRows = sentForPickup
            .filter(v => v.sent_for_pickup_time && daysSince(v.sent_for_pickup_time) >= 3)
            .map(v => vehicleRowHtml(v, `${daysSince(v.sent_for_pickup_time)} day(s) since pickup request — ${formatET(v.sent_for_pickup_time)}`));

        // 3. Returned but not archived
        const returned = await base44.asServiceRole.entities.RepairPass.filter({ status: 'returned', archived: false });
        const returnedRows = returned
            .map(v => vehicleRowHtml(v, v.return_time ? `Returned ${formatET(v.return_time)}` : 'Returned'));

        const totalVehicles = pendingRows.length + pickupRows.length + returnedRows.length;
        if (totalVehicles === 0) {
            return Response.json({ sent: 0, message: 'No vehicles need reminders today' });
        }

        const sections = [
            sectionHtml({
                accentColor: '#d97706',
                badgeText: 'Pending Departure',
                intro: 'These vehicles were added to the tracker but have not left the lot yet. Please follow up.',
                detailHeader: 'Details',
                rows: pendingRows,
            }),
            sectionHtml({
                accentColor: '#dc2626',
                badgeText: 'Not Returned',
                intro: 'These vehicles were sent for pickup but have not been marked returned. Please follow up.',
                detailHeader: 'Details',
                rows: pickupRows,
            }),
            sectionHtml({
                accentColor: '#2563eb',
                badgeText: 'Awaiting Archive',
                intro: 'These vehicles have returned but are not archived. If the invoice is in and charges are posted, please archive them.',
                detailHeader: 'Details',
                rows: returnedRows,
            }),
        ].join('');

        const dateStr = new Date().toLocaleDateString('en-US', {
            timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
        });

        const html = `
        <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <div style="background:#1e2a4a;padding:20px 24px;">
              <span style="color:#ffffff;font-size:16px;font-weight:bold;">Repair Pass Tracker</span>
            </div>
            <div style="padding:24px;">
              <h1 style="font-size:20px;color:#0f172a;margin:0 0 6px;">Daily Status Reminders — ${dateStr}</h1>
              <p style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.5;">${totalVehicles} vehicle(s) need attention today.</p>
              ${sections}
            </div>
            <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="font-size:12px;color:#94a3b8;margin:0;">This is an automated daily reminder from Repair Pass Tracker.</p>
              <p style="font-size:12px;color:#64748b;margin:8px 0 0;">See an error with a vehicle's info? <a href="mailto:zevans@carolinaautoauction.com?subject=${encodeURIComponent('Error Report: Daily Status Reminders')}" style="color:#1e2a4a;font-weight:bold;">Report an Error</a></p>
            </div>
          </div>
        </div>`;

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Repair Pass Tracker <alerts@repairpasscarolinaautoauction.info>',
                to: recipients,
                subject: `Daily Status Reminders: ${totalVehicles} vehicle(s) need attention`,
                html,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Resend failure:', res.status, errText);
            return Response.json({ error: `Email send failed: ${res.status}` }, { status: 500 });
        }

        return Response.json({ sent: 1, vehiclesIncluded: totalVehicles, pendingChecked: pending.length, pickupChecked: sentForPickup.length, returnedChecked: returned.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});