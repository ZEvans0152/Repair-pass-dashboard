import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.2.1';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert bytes to base64 in chunks — spreading the whole array as
// arguments overflows the call stack once the PDF grows past ~100KB.
function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const SECTIONS = [
  {
    title: 'VEHICLE INFORMATION',
    fields: [
      { key: 'date', label: 'Date' },
      { key: 'stock_no', label: 'Stock No' },
      { key: 'last8_vin', label: 'Last 8 VIN' },
    ],
  },
  {
    title: 'TRANSPORT',
    fields: [{ key: 'transporter', label: 'Transporter' }],
  },
  {
    title: 'AUCTION CONTACT',
    fields: [
      { key: 'auction_contact', label: 'Contact' },
      { key: 'auction_phone', label: 'Phone' },
    ],
  },
  {
    title: 'DEALERSHIP',
    fields: [
      { key: 'dealership', label: 'Dealership' },
      { key: 'dealer_address', label: 'Address' },
      { key: 'dealer_contact', label: 'Contact' },
      { key: 'dealer_phone', label: 'Phone' },
    ],
  },
  {
    title: 'VEHICLE DETAILS',
    fields: [
      { key: 'lease_co', label: 'Lease Co' },
      { key: 'year', label: 'Year' },
      { key: 'make', label: 'Make' },
      { key: 'model', label: 'Model' },
      { key: 'color', label: 'Color' },
      { key: 'mileage', label: 'Mileage' },
    ],
  },
];

function generatePdfBytes(form) {
  const doc = new jsPDF();
  const navy = [30, 58, 95];
  let y = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...navy);
  doc.text('SEND OUT FORM', 105, y, { align: 'center' });
  y += 4;
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.8);
  doc.line(20, y, 190, y);
  y += 10;

  for (const section of SECTIONS) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text(section.title, 20, y);
    doc.setLineWidth(0.3);
    doc.line(20, y + 1.5, 190, y + 1.5);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    for (const f of section.fields) {
      doc.setFont('helvetica', 'normal');
      doc.text(`${f.label}:`, 22, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(form[f.key] || ''), 55, y);
      y += 7;
    }
    y += 3;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text('COMMENTS / REPAIRS REQUESTED', 20, y);
  doc.setLineWidth(0.3);
  doc.line(20, y + 1.5, 190, y + 1.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(form.comments || '', 166);
  doc.text(lines, 22, y);

  doc.setFontSize(20);
  doc.setTextColor(100, 100, 100);
  doc.text('Please send all invoices to: invoice@carolinaautoauction.com', 105, 285, { align: 'center' });

  return doc.output('arraybuffer');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { pass_id, form } = await req.json();
    if (!pass_id || !form) return Response.json({ error: 'pass_id and form are required' }, { status: 400 });

    let pass = null;
    try {
      pass = await base44.asServiceRole.entities.RepairPass.get(pass_id);
    } catch (_) {}
    if (!pass) {
      // Fallback: look up by stock number
      const matches = await base44.asServiceRole.entities.RepairPass.filter({ stock_number: pass_id });
      pass = matches[0] || null;
    }
    if (!pass) return Response.json({ error: 'Repair pass not found' }, { status: 404 });

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    const alertEmail = settingsList[0]?.alert_email;
    if (!alertEmail) return Response.json({ error: 'No alert email configured' }, { status: 400 });

    const stock = pass.stock_number;
    const dealership = pass.dealership || 'N/A';
    const address = pass.dealership_address || 'N/A';
    const trackerStatus = pass.no_tracker
      ? 'NO TRACKER FOUND — Please verify manually'
      : pass.cognosos_asset_id
        ? `Tracker Found — Asset ID: ${pass.cognosos_asset_id}`
        : 'Tracker status unknown — Please verify';

    const pdfBytes = generatePdfBytes(form);
    const pdfBase64 = bytesToBase64(pdfBytes);

    const bodyText = pass.no_tracker
      ? [
          `!!! NO TRACKER FOUND — ${trackerStatus}`,
          ``,
          `Please have a repair pass made for this unit and send it to:`,
          ``,
          `${dealership}`,
          `${address}`,
          ``,
          `PLEASE VERIFY THAT A WORKING TRACKER IS WITH THE UNIT BEFORE IT LEAVES.`,
          ``,
          `Attached is the Send Out Form.`,
        ].join('\n')
      : [
          `Please have a repair pass made for this unit and send it to:`,
          ``,
          `${dealership}`,
          `${address}`,
          ``,
          `Current Tracker Status: ${trackerStatus}`,
          ``,
          `Please verify that a working tracker is with the unit before it leaves.`,
          ``,
          `Attached is the Send Out Form.`,
        ].join('\n');

    const trackerWarning = pass.no_tracker
      ? `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin:0 0 16px;">
           <table cellpadding="0" cellspacing="0" style="width:100%;">
             <tr>
               <td style="width:32px;vertical-align:top;font-size:20px;">&#128680;</td>
               <td style="font-size:14px;color:#991b1b;">
                 <strong style="font-size:16px;">&#9888; NO TRACKER FOUND</strong><br/>
                 <span style="color:#991b1b;">${escapeHtml(trackerStatus)}</span>
               </td>
             </tr>
           </table>
         </div>`
      : `<p style="background:#f0fdf4;padding:12px;border-left:4px solid #16a34a;border-radius:4px;">
           <strong>Tracker Status:</strong> ${escapeHtml(trackerStatus)}
         </p>`;

    const verifyText = pass.no_tracker
      ? `<p style="color:#991b1b;font-weight:bold;font-size:15px;">&#9888; Please verify that a working tracker is with the unit before it leaves.</p>`
      : `<p>Please verify that a working tracker is with the unit before it leaves.</p>`;

    const htmlBody = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;">
      <h2 style="color:#1e2a4a;">Repair Pass Request — Stock #${escapeHtml(stock)}</h2>
      ${trackerWarning}
      <p>Please have a repair pass made for this unit and send it to:</p>
      <p style="margin-left:16px;">
        <strong>${escapeHtml(dealership)}</strong><br/>
        ${escapeHtml(address)}
      </p>
      ${verifyText}
      <p>Attached is the <strong>Send Out Form</strong> for this vehicle.</p>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;"/>
      <p style="font-size:12px;color:#94a3b8;">This is an automated alert from CAA Vehicle Dispatch.</p>
    </div>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CAA Vehicle Dispatch <alerts@repairpasscarolinaautoauction.info>',
        to: alertEmail.split(',').map(e => e.trim()).filter(Boolean),
        subject: `Please Have a Repair Pass Made for This Unit — Stock #${stock}`,
        html: htmlBody,
        attachments: [
          {
            filename: `SendOutForm_${stock}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!resendRes.ok) throw new Error(`Resend failed: ${resendRes.status} ${await resendRes.text()}`);

    return Response.json({ sent: true });
  } catch (error) {
    console.error(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});