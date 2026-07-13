import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function buildEmailHtml({ accentColor, badgeText, title, intro, rows, mapUrl }) {
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
          <span style="color:#ffffff;font-size:16px;font-weight:bold;">Repair Pass Tracker</span>
        </div>
        <div style="padding:24px;">
          <span style="display:inline-block;background:${accentColor}1A;color:${accentColor};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${badgeText}</span>
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
          <p style="font-size:12px;color:#94a3b8;margin:0;">This is an automated alert from Repair Pass Tracker.</p>
        </div>
      </div>
    </div>`;
}

async function sendResendEmail(to, subject, html) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Repair Pass Tracker <alerts@repairpasscarolinaautoauction.info>',
            to: to.split(',').map(e => e.trim()).filter(Boolean),
            subject,
            html,
        }),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        let overrideTo = null;
        try { overrideTo = (await req.json())?.to || null; } catch { /* no body */ }
        const settings = (await base44.asServiceRole.entities.AppSettings.list())[0];
        const to = overrideTo || settings?.alert_email;
        if (!to) return Response.json({ error: 'No alert email configured in Settings' }, { status: 400 });

        const mapUrl = 'https://www.google.com/maps?q=34.5034,-82.6501';
        const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET';

        const samples = [
            {
                subject: '[TEST] Vehicle Departed Lot: Ford F-150 - Stock #12345',
                html: buildEmailHtml({
                    accentColor: '#ea580c',
                    badgeText: 'Departed Lot',
                    title: 'Ford F-150 has left the lot',
                    intro: 'A vehicle has departed on a repair pass. Details are below.',
                    rows: [
                        ['Vehicle', 'Ford F-150'],
                        ['Stock #', '12345'],
                        ['VIN', '1FTFW1ET5DFC10312'],
                        ['Client', 'Sample Client'],
                        ['Dealership', 'Sample Dealership'],
                        ['Reason', 'Windshield replacement'],
                        ['Departed', nowET],
                    ],
                    mapUrl,
                }),
            },
            {
                subject: '[TEST] Vehicle Returned to Lot: Ford F-150 - Stock #12345',
                html: buildEmailHtml({
                    accentColor: '#16a34a',
                    badgeText: 'Returned to Lot',
                    title: 'Ford F-150 is back on the lot',
                    intro: 'A vehicle has returned from its repair pass. Details are below.',
                    rows: [
                        ['Vehicle', 'Ford F-150'],
                        ['Stock #', '12345'],
                        ['VIN', '1FTFW1ET5DFC10312'],
                        ['Client', 'Sample Client'],
                        ['Dealership', 'Sample Dealership'],
                        ['Returned', nowET],
                        ['Zone', 'Main Lot'],
                    ],
                    mapUrl: null,
                }),
            },
            {
                subject: '[TEST] Tracker Found: 2022 Ford F-150 — Stock #12345',
                html: buildEmailHtml({
                    accentColor: '#0ea5e9',
                    badgeText: 'Tracker Found',
                    title: 'Tracker detected on 2022 Ford F-150',
                    intro: 'A GPS tracker has been detected on a vehicle that was previously listed as having no tracker.',
                    rows: [
                        ['Vehicle', '2022 Ford F-150'],
                        ['Stock #', '12345'],
                        ['VIN', '1FTFW1ET5DFC10312'],
                        ['Client', 'Sample Client'],
                        ['Tracker ID', 'TRK-00987'],
                    ],
                    mapUrl: null,
                }),
            },
            {
                subject: '[TEST] Overdue Vehicle: Ford F-150 (Stock #12345)',
                html: buildEmailHtml({
                    accentColor: '#dc2626',
                    badgeText: 'Overdue',
                    title: 'Ford F-150 is overdue',
                    intro: 'This vehicle has been out past the allowed time. Please follow up.',
                    rows: [
                        ['Vehicle', 'Ford F-150'],
                        ['Stock #', '12345'],
                        ['VIN', '1FTFW1ET5DFC10312'],
                        ['Client', 'Sample Client'],
                        ['Dealership', 'Sample Dealership'],
                        ['Departed', nowET],
                        ['Time Out', 'Over 72 hours'],
                    ],
                    mapUrl,
                }),
            },
        ];

        const results = [];
        for (const s of samples) {
            const r = await sendResendEmail(to, s.subject, s.html);
            results.push({ subject: s.subject, ...r });
        }

        return Response.json({ to, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});