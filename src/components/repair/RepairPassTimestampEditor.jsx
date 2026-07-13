import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { X } from 'lucide-react';

export default function RepairPassTimestampEditor() {
  const [search, setSearch] = useState('');
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    setPass(null);
    const results = await base44.entities.RepairPass.filter({ stock_number: search.trim() });
    if (results.length === 0) {
      toast.error('No repair pass found for that stock number');
    } else {
      setPass(results[0]);
    }
    setLoading(false);
  }

  async function clearField(field) {
    setSaving(true);
    await base44.entities.RepairPass.update(pass.id, { [field]: null });
    setPass({ ...pass, [field]: null });
    toast.success(`${field === 'departure_time' ? 'Departure' : 'Return'} time cleared`);
    setSaving(false);
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Clear Departure / Return Times</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Stock number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Look Up'}
          </Button>
        </div>

        {pass && (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="font-medium">{pass.year} {pass.make} {pass.model} — Stock #{pass.stock_number}</p>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Departure Time</Label>
                <p className="text-sm">{pass.departure_time ? new Date(pass.departure_time).toLocaleString() : <span className="text-muted-foreground italic">Not set</span>}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!pass.departure_time || saving}
                onClick={() => clearField('departure_time')}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Return Time</Label>
                <p className="text-sm">{pass.return_time ? new Date(pass.return_time).toLocaleString() : <span className="text-muted-foreground italic">Not set</span>}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!pass.return_time || saving}
                onClick={() => clearField('return_time')}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}