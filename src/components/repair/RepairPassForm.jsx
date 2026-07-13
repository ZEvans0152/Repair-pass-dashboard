import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import DealershipAutocomplete from '@/components/DealershipAutocomplete';
import useFormSuggestions from '@/hooks/useFormSuggestions';

const fields = [
  { key: 'vin', label: 'VIN', placeholder: '1HGCM82633A004352', required: true },
  { key: 'stock_number', label: 'Stock #', placeholder: 'STK-1042', required: true },
  { key: 'make', label: 'Make', placeholder: 'Toyota', required: true },
  { key: 'model', label: 'Model', placeholder: 'Camry', required: true },
  { key: 'year', label: 'Year', placeholder: '2023' },
  { key: 'color', label: 'Color', placeholder: 'Silver' },
  { key: 'mileage', label: 'Mileage', placeholder: '45,000' },
  { key: 'client', label: 'Client', placeholder: 'Client name' },
  { key: 'dealership', label: 'Dealership', placeholder: 'Destination dealership' },
  { key: 'dealership_address', label: 'Address', placeholder: 'Dealership street address' },
  { key: 'reason', label: 'Reason for Send', placeholder: 'e.g. Warranty repair, recall work' },
];

export default function RepairPassForm({ open, onOpenChange, onSubmit, isSaving }) {
  const [form, setForm] = useState({});
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [dupError, setDupError] = useState('');
  const [checkingDup, setCheckingDup] = useState(false);
  const sugg = useFormSuggestions(open);

  useEffect(() => {
    if (!open) {
      setForm({});
      setLookupError('');
      setLookingUp(false);
      setDupError('');
      setCheckingDup(false);
    }
  }, [open]);

  const handleStockLookup = async (stock) => {
    if (!stock?.trim()) return;
    setLookingUp(true);
    setLookupError('');
    try {
      const res = await base44.functions.invoke('lookupVehicleByStock', { stock_number: stock.trim() });
      if (res.data?.found === false) {
        setLookupError(`Stock #${stock.trim()} was not found in Cognosos. Vehicle details must be entered manually.`);
      }
      if (res.data?.found && res.data.vehicle) {
        const v = res.data.vehicle;
        setForm((f) => ({
          ...f,
          vin: v.vin || f.vin || '',
          make: v.make || f.make || '',
          model: v.model || f.model || '',
          client: v.client || f.client || '',
          year: v.year || f.year || '',
          color: v.color || f.color || '',
          mileage: v.mileage || f.mileage || '',
        }));
      }
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDupError('');
    setCheckingDup(true);
    try {
      const stock = (form.stock_number || '').trim();
      const existing = await base44.entities.RepairPass.filter({ stock_number: stock, archived: false });
      if (existing.length > 0) {
        setDupError(`Stock #${stock} is already active on the dashboard. Remove or archive the existing pass before creating a new one.`);
        return;
      }
      onSubmit(form);
      setForm({});
    } finally {
      setCheckingDup(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">New Repair Pass</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.key === 'reason' ? 'sm:col-span-2' : ''}`}>
                <Label htmlFor={f.key} className="flex items-center gap-2">
                  {f.label}
                  {f.key === 'stock_number' && lookingUp && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                      <Loader2 className="w-3 h-3 animate-spin" /> Searching Cognosos...
                    </span>
                  )}
                </Label>
                {f.key === 'dealership_address' ? (
                  <AddressAutocomplete
                    id={f.key}
                    placeholder={f.placeholder}
                    value={form[f.key] || ''}
                    onChange={(val) => setForm({ ...form, [f.key]: val })}
                    prefillHint={form.dealership || ''}
                  />
                ) : f.key === 'dealership' ? (
                  <DealershipAutocomplete
                    id={f.key}
                    placeholder={f.placeholder}
                    value={form.dealership || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, dealership: val }))}
                    savedSuggestions={sugg.dealerships}
                    onSelect={(s) => setForm((prev) => ({ ...prev, dealership: s.name, dealership_address: s.address || prev.dealership_address }))}
                  />
                ) : (
                  <Input
                    id={f.key}
                    required={f.required}
                    placeholder={f.placeholder}
                    value={form[f.key] || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    onBlur={f.key === 'stock_number' ? (e) => handleStockLookup(e.target.value) : undefined}
                  />
                )}
                {f.key === 'stock_number' && lookupError && (
                  <p className="text-xs text-red-600">{lookupError}</p>
                )}
              </div>
            ))}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about this unit..."
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          {dupError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dupError}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || checkingDup} className="bg-primary hover:bg-primary/90">
              {isSaving || checkingDup ? 'Saving...' : 'Create Pass'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}