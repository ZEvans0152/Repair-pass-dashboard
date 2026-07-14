import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, MapPin, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export default function VehicleMovementsDialog({ open, onClose, vehicle }) {
  const [movements, setMovements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !vehicle) return;
    setLoading(true);
    setError(null);
    setMovements(null);
    base44.functions.invoke('getDeviceMovements', { device_id: vehicle.device_id })
      .then((res) => {
        setMovements(res.data.movements || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load movements');
      })
      .finally(() => setLoading(false));
  }, [open, vehicle]);

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.asset_identifier || vehicle.device_id
    : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Movement History — {vehicleName}
          </DialogTitle>
          {vehicle?.stock_number && (
            <p className="text-sm text-muted-foreground">Stock #{vehicle.stock_number}</p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground text-sm">Loading movement history...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && movements && movements.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="font-medium">No movement events found</p>
            <p className="text-sm">This device has no recorded zone transitions.</p>
          </div>
        )}

        {!loading && movements && movements.length > 0 && (
          <div className="relative pl-6 border-l-2 border-blue-200 space-y-4 ml-2 mt-2">
            {movements.map((m, i) => {
              const enteredFmt = m.entered
                ? format(parseISO(m.entered), 'M/d/yyyy h:mm:ss a')
                : null;
              const leftFmt = m.left
                ? format(parseISO(m.left), 'M/d/yyyy h:mm:ss a')
                : null;
              const isLeftLot = /left\s*(lot|site)/i.test(m.zone_name || '');

              return (
                <div key={i} className="relative pl-6 pb-2">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[29px] w-3 h-3 rounded-full border-2 border-white ${isLeftLot ? 'bg-red-500' : 'bg-blue-500'}`} />

                  <div className="bg-muted/40 rounded-lg p-3 border">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge variant={isLeftLot ? 'destructive' : 'secondary'} className="text-xs">
                        {m.zone_name}
                      </Badge>
                      {m.application_code && (
                        <span className="text-[10px] text-muted-foreground font-mono">{m.application_code}</span>
                      )}
                    </div>

                    <div className="space-y-1 text-sm">
                      {enteredFmt && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="text-xs font-medium text-green-600 w-16 shrink-0">Entered:</span>
                          <span>{enteredFmt}</span>
                        </div>
                      )}
                      {leftFmt ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="text-xs font-medium text-orange-600 w-16 shrink-0">Left:</span>
                          <span>{leftFmt}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="text-xs font-medium text-blue-600 w-16 shrink-0">Status:</span>
                          <span>{isLeftLot ? 'Currently off lot' : 'Still in this zone'}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      <span className="font-mono">Node: {m.node_id || '?'}</span>
                      {m.asset_identifier && (
                        <>
                          <span>·</span>
                          <span className="font-mono">Asset: {m.asset_identifier}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}