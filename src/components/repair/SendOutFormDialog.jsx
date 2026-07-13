import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, Send, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { jsPDF } from 'jspdf';
import SuggestInput from '@/components/SuggestInput';
import useFormSuggestions from '@/hooks/useFormSuggestions';

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

function buildPdf(form) {
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

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Please send all invoices to: invoice@carolinaautoauction.com', 105, 285, { align: 'center' });

  doc.save(`SendOutForm_${form.stock_no || 'unit'}.pdf`);
}

export default function SendOutFormDialog({ pass, open, onOpenChange }) {
  const [form, setForm] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendError, setSendError] = useState(null);
  const sugg = useFormSuggestions(open);

  useEffect(() => {
    if (open && pass) {
      setSent(false);
      setSendError(null);
      setForm({
        date: new Date().toLocaleDateString('en-US'),
        stock_no: pass.stock_number || '',
        last8_vin: pass.vin ? pass.vin.slice(-8) : '',
        transporter: pass.transporter || 'Wood',
        auction_contact: pass.auction_contact || '',
        auction_phone: pass.auction_phone || '',
        dealership: pass.dealership || '',
        dealer_address: pass.dealership_address || '',
        dealer_contact: pass.dealer_contact || '',
        dealer_phone: pass.dealer_phone || '',
        lease_co: pass.client || '',
        year: pass.year || '',
        make: pass.make || '',
        model: pass.model || '',
        color: pass.color || '',
        mileage: pass.mileage || '',
        comments: pass.reason || '',
      });
    }
  }, [open, pass?.id]);

  if (!pass) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const saveFormToPass = () =>
    base44.entities.RepairPass.update(pass.id, {
      transporter: form.transporter,
      auction_contact: form.auction_contact,
      auction_phone: form.auction_phone,
      dealer_contact: form.dealer_contact,
      dealer_phone: form.dealer_phone,
      send_out_form_sent_at: new Date().toISOString(),
    });

  const handleConfirmSend = async () => {
    setConfirmOpen(false);
    // Small delay to let the AlertDialog fully close before updating state
    await new Promise((r) => setTimeout(r, 150));
    setSending(true);
    setSendError(null);
    try {
      const [, emailRes] = await Promise.all([
        saveFormToPass(),
        base44.functions.invoke('sendSendOutFormEmail', { pass_id: pass.id, form }),
      ]);
      if (emailRes?.data?.error) throw new Error(emailRes.data.error);
      setSent(true);
    } catch (err) {
      setSendError(err.response?.data?.error || err.message || 'Failed to send email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!confirmOpen) onOpenChange(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Send Out Form — {pass.stock_number}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-bold tracking-wide text-primary border-b pb-1 mb-3">{section.title}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {section.fields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {f.key === 'dealership' ? (
                        <SuggestInput
                          value={form.dealership || ''}
                          onChange={(v) => setForm((s) => ({ ...s, dealership: v }))}
                          suggestions={sugg.dealerships}
                          onSelect={(s) => setForm((prev) => ({
                            ...prev,
                            dealership: s.label,
                            dealer_address: s.data.address || prev.dealer_address,
                            dealer_contact: s.data.contact || prev.dealer_contact,
                            dealer_phone: s.data.phone || prev.dealer_phone,
                          }))}
                          className="h-8"
                        />
                      ) : f.key === 'auction_contact' ? (
                        <SuggestInput
                          value={form.auction_contact || ''}
                          onChange={(v) => setForm((s) => ({ ...s, auction_contact: v }))}
                          suggestions={sugg.auctionContacts}
                          onSelect={(s) => setForm((prev) => ({ ...prev, auction_contact: s.label, auction_phone: s.data.phone || prev.auction_phone }))}
                          className="h-8"
                        />
                      ) : f.key === 'dealer_contact' ? (
                        <SuggestInput
                          value={form.dealer_contact || ''}
                          onChange={(v) => setForm((s) => ({ ...s, dealer_contact: v }))}
                          suggestions={sugg.dealerContacts}
                          onSelect={(s) => setForm((prev) => ({ ...prev, dealer_contact: s.label, dealer_phone: s.data.phone || prev.dealer_phone }))}
                          className="h-8"
                        />
                      ) : (
                        <Input value={form[f.key] || ''} onChange={set(f.key)} className="h-8" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className="text-xs font-bold tracking-wide text-primary border-b pb-1 mb-3">COMMENTS / REPAIRS REQUESTED</h3>
              <Textarea value={form.comments || ''} onChange={set('comments')} className="min-h-[100px]" />
            </div>

            {sendError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{sendError}</p>
            )}

            <div className="flex justify-end gap-3">
              <Button onClick={() => buildPdf(form)} variant="outline" className="gap-2">
                <Download className="w-4 h-4" /> Download PDF
              </Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={sending || sent} className="gap-2">
                {sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending...' : sent ? 'Sent!' : 'Email Form'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Email Form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email the Send Out Form for Stock #{pass.stock_number} to the configured alert email and save the contact info you entered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSend}>Send Email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}