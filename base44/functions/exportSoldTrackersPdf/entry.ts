import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const filterKey = body.filter || 'all';

    const all = await base44.entities.SoldTracker.list('-left_date', 5000);
    if (all.length === 0) {
      return Response.json({ error: 'No data to export' }, { status: 400 });
    }

    // Filter logic matching frontend
    const now = new Date();
    let filtered = all;

    if (filterKey !== 'all') {
      const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const startOfWeek = (d) => {
        const day = d.getDay();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      };
      const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfWeek = (d) => {
        const day = d.getDay();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - day), 23, 59, 59, 999);
      };

      if (filterKey === 'last_week') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lwStart = startOfWeek(lastWeek);
        const lwEnd = endOfWeek(lastWeek);
        filtered = all.filter((t) => {
          if (!t.left_date) return false;
          const d = new Date(t.left_date);
          return d >= lwStart && d <= lwEnd;
        });
      } else {
        let cutoff;
        if (filterKey === 'today') cutoff = startOfDay(now);
        else if (filterKey === 'week') cutoff = startOfWeek(now);
        else if (filterKey === 'month') cutoff = startOfMonth(now);

        if (cutoff) {
          filtered = all.filter((t) => {
            if (!t.left_date) return false;
            const d = new Date(t.left_date);
            return d >= cutoff;
          });
        }
      }
    }

    if (filtered.length === 0) {
      return Response.json({ error: 'No matching records for filter' }, { status: 400 });
    }

    // Build PDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;
    const colW = [
      18,  // Stock #
      30,  // VIN
      11,  // Year
      20,  // Make
      22,  // Model
      34,  // Buyer
      48,  // Left Date & Time
      15,  // Zone
      14,  // Color
      22,  // Client
    ];
    const totalW = colW.reduce((a, b) => a + b, 0);
    const startX = margin;

    // Header
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Sold Vehicles Report', margin, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const filterLabel = filterKey === 'last_week' ? 'Last Week' : filterKey.charAt(0).toUpperCase() + filterKey.slice(1);
    doc.text(`Filter: ${filterLabel}  |  Count: ${filtered.length}  |  Generated: ${now.toLocaleDateString('en-US')}`, margin, 16);

    // Table header
    const tableTop = 26;
    doc.setFillColor(240, 242, 245);
    doc.rect(margin, tableTop, totalW, 7, 'F');
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');

    const headers = ['Stock #', 'VIN', 'Year', 'Make', 'Model', 'Buyer', 'Left Date & Time', 'Zone', 'Color', 'Client'];
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 1, tableTop + 5);
      x += colW[i];
    });

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(40, 40, 40);

    let y = tableTop + 9;
    let rowIdx = 0;

    filtered.forEach((t, idx) => {
      if (y > 190) {
        // Footer on current page
        doc.setFontSize(6);
        doc.setTextColor(140, 140, 140);
        doc.text(`Page ${doc.internal.pages.length - 1}`, pageW - 20, 200);
        doc.addPage();
        y = 14;
        rowIdx = 0;
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        // Repeat header on new page
        doc.setFillColor(240, 242, 245);
        doc.rect(margin, y, totalW, 7, 'F');
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'bold');
        x = startX;
        headers.forEach((h, i) => {
          doc.text(h, x + 1, y + 5);
          x += colW[i];
        });
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'normal');
        y += 9;
      }

      // Alternating row color
      if (rowIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 4, totalW, 6, 'F');
      }

      const leftDate = t.left_date
        ? new Date(t.left_date).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : '-';

      const row = [
        (t.stock_number || t.asset_identifier || '-').substring(0, 10),
        (t.vin || '-').substring(0, 20),
        (t.year || '-').substring(0, 4),
        (t.make || '-').substring(0, 12),
        (t.model || '-').substring(0, 14),
        (t.buyer || '-').substring(0, 22),
        leftDate,
        (t.zone || '-').substring(0, 8),
        (t.color || '-').substring(0, 7),
        (t.client || '-').substring(0, 14),
      ];

      x = startX;
      row.forEach((cell, i) => {
        doc.text(cell, x + 1, y);
        x += colW[i];
      });

      y += 6;
      rowIdx++;
    });

    // Final footer
    doc.setFontSize(6);
    doc.setTextColor(140, 140, 140);
    const totalPages = doc.internal.pages.length - 1;
    doc.text(`Page ${totalPages} of ${totalPages}`, pageW - 25, 200);

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=sold-vehicles-${filterKey}-${now.toISOString().slice(0, 10)}.pdf`,
      },
    });
  } catch (error) {
    console.error(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});