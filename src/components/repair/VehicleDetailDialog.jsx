import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatET, parseUTC } from '@/lib/time';
import { Send, StickyNote } from 'lucide-react';
import StatusBadge from './StatusBadge';
import VehicleMap from './VehicleMap';

export default function VehicleDetailDialog({ pass, open, onOpenChange }) {
  const [newNote, setNewNote] = useState('');
  const queryClient = useQueryClient();

  const { data: notes = [] } = useQuery({
    queryKey: ['repairNotes', pass?.id],
    queryFn: () => base44.entities.RepairNote.filter({ repair_pass_id: pass.id }, 'created_date'),
    enabled: !!pass,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content) => {
      let author = '';
      try {
        const user = await base44.auth.me();
        author = user.full_name || user.email || '';
      } catch { /* save the note even if user lookup fails */ }
      const note = await base44.entities.RepairNote.create({
        repair_pass_id: pass.id,
        content,
        author,
      });
      // Keep the quick-glance latest note on the pass itself
      // Clear overdue status since a new note shows activity
      const updateData = { latest_note: content, latest_note_at: new Date().toISOString() };
      if (pass.status === 'overdue') updateData.status = 'out';
      await base44.entities.RepairPass.update(pass.id, updateData);
      return note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairNotes', pass?.id] });
      queryClient.invalidateQueries({ queryKey: ['repairPasses'] });
      setNewNote('');
    },
  });

  const handleAdd = (e) => {
    e.preventDefault();
    if (newNote.trim()) addNoteMutation.mutate(newNote.trim());
  };

  if (!pass) return null;

  const details = [
    ['VIN', pass.vin],
    ['Stock #', pass.stock_number],
    ['Client', pass.client],
    ['Dealership', pass.dealership],
    ['Reason', pass.reason],
    ['Pending For', pass.status === 'pending_departure'
      ? `${Math.max(0, Math.floor((Date.now() - parseUTC(pass.created_date).getTime()) / 86400000))} day(s)`
      : null],
  ];

  const timestamps = [
    ['Repair pass added', pass.created_date],
    ['Vehicle departed', pass.departure_time],
    ['Send out form sent', pass.send_out_form_sent_at],
    ['Sent for pickup', pass.sent_for_pickup_time],
    ['Vehicle returned', pass.return_time],
  ].filter(([, v]) => v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-3">
            {pass.make} {pass.model}
            <StatusBadge status={pass.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {details.filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{label}:</span>
              <span className="font-medium truncate" title={value}>{value}</span>
            </div>
          ))}
        </div>

        <VehicleMap
          lat={pass.current_lat}
          lng={pass.current_lng}
          vehicleName={`${pass.make} ${pass.model}`}
          zone={pass.current_zone}
          status={pass.status}
          cognososAssetId={pass.cognosos_asset_id}
        />

        <div className="border-t pt-3 flex-1 min-h-0 flex flex-col">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <StickyNote className="w-4 h-4 text-slate-500" /> Notes
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {timestamps.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                {timestamps.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-slate-700">{formatET(value, true)}</span>
                  </div>
                ))}
              </div>
            )}
            {notes.length === 0 && !pass.notes && (
              <p className="text-sm text-muted-foreground py-4 text-center">No notes yet.</p>
            )}
            {pass.notes && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{pass.notes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Initial note · {formatET(pass.created_date, true)}
                </p>
              </div>
            )}
            {notes.map((n) => (
              <div key={n.id} className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {n.author || 'Unknown'} · {formatET(n.created_date, true)}
                </p>
              </div>
            ))}
          </div>
          {addNoteMutation.isError && (
            <p className="text-xs text-red-600 pt-2">
              Could not save note: {addNoteMutation.error?.message || 'unknown error'}
            </p>
          )}
          <form onSubmit={handleAdd} className="flex gap-2 pt-3">
            <Textarea
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[40px] h-[60px]"
            />
            <Button type="submit" size="icon" disabled={addNoteMutation.isPending || !newNote.trim()} className="self-end">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}