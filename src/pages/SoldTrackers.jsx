import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Tag, User, Calendar, ExternalLink, Download, Link, Unlink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import VehicleMovementsDialog from '@/components/VehicleMovementsDialog';
import { startOfDay, startOfWeek, startOfMonth, endOfWeek, subWeeks, parseISO, isAfter, isSameDay, isWithinInterval, format } from 'date-fns';

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
];

function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function SoldTrackers() {
  const [filter, setFilter] = useState('today');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [movementsOpen, setMovementsOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: trackers = [], isLoading, error } = useQuery({
    queryKey: ['soldTrackers'],
    queryFn: () => base44.entities.SoldTracker.list('-left_date', 2000),
    refetchInterval: 900000,
  });

  const toggleDetach = useMutation({
    mutationFn: ({ id, detached }) => base44.entities.SoldTracker.update(id, { detached }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['soldTrackers'] }),
    onError: (err) => toast({
      variant: 'destructive',
      title: 'Failed to update tracker',
      description: err?.message || 'The change was not saved. Please try again.',
    }),
  });

  const handleToggleDetach = useCallback((e, t) => {
    e.stopPropagation();
    toggleDetach.mutate({ id: t.id, detached: !t.detached });
  }, [toggleDetach]);

  const filtered = useMemo(() => {
    if (filter === 'all') return trackers;

    const now = new Date();
    if (filter === 'last_week') {
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 0 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 0 });
      return trackers.filter((t) => {
        if (!t.left_date) return false;
        try {
          const d = parseISO(t.left_date);
          return isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd });
        } catch { return false; }
      });
    }

    let cutoff;
    if (filter === 'today') cutoff = startOfDay(now);
    else if (filter === 'week') cutoff = startOfWeek(now, { weekStartsOn: 0 });
    else if (filter === 'month') cutoff = startOfMonth(now);

    return trackers.filter((t) => {
      if (!t.left_date) return false;
      try {
        const d = parseISO(t.left_date);
        return isAfter(d, cutoff) || isSameDay(d, cutoff);
      } catch { return false; }
    });
  }, [trackers, filter]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-heading font-bold">Sold Vehicles (Tracker Left)</h1>
        </div>
        <Badge variant="outline" className="text-sm">
          {isLoading ? '...' : `${filtered.length} sold`}
        </Badge>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0 || isLoading}
          onClick={async () => {
            const res = await base44.functions.invoke('exportSoldTrackersPdf', { filter });
            if (res.data instanceof Blob) {
              const url = URL.createObjectURL(res.data);
              const a = document.createElement('a');
              a.href = url;
              a.download = `sold-vehicles-${filter}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            } else {
              const blob = new Blob([res.data], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `sold-vehicles-${filter}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }
          }}
          className="gap-1.5"
        >
          <Download className="w-4 h-4" /> Export PDF
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading sold vehicle data...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to load sold tracker data. Please try refreshing the page.
        </div>
      )}

      {!isLoading && filtered.length === 0 && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium">No sold vehicles found</p>
          <p className="text-sm">
            {filter === 'today' ? 'No vehicles left the lot today.' : 'Try a wider date range.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-3 font-semibold">Stock #</th>
                  <th className="text-left px-3 py-3 font-semibold">VIN</th>
                  <th className="text-left px-3 py-3 font-semibold">Year</th>
                  <th className="text-left px-3 py-3 font-semibold">Make</th>
                  <th className="text-left px-3 py-3 font-semibold">Model</th>
                  <th className="text-left px-3 py-3 font-semibold">Buyer</th>
                  <th className="text-left px-3 py-3 font-semibold">Left Date</th>
                  <th className="text-left px-3 py-3 font-semibold">Zone</th>
                  <th className="text-left px-3 py-3 font-semibold">Tracker</th>
                  <th className="text-left px-3 py-3 font-semibold">Map</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b last:border-0 hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedVehicle(t); setMovementsOpen(true); }}
                  >
                    <td className="px-3 py-3 font-medium">{t.stock_number || t.asset_identifier || '—'}</td>
                    <td className="px-3 py-3 font-mono text-xs">{t.vin || '—'}</td>
                    <td className="px-3 py-3">{t.year || '—'}</td>
                    <td className="px-3 py-3">{t.make || '—'}</td>
                    <td className="px-3 py-3">{t.model || '—'}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 max-w-[140px] truncate" title={t.buyer}>
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {t.buyer}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        {t.left_date ? format(parseISO(t.left_date), 'M/d/yyyy h:mm a') : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="text-xs">{t.zone || '—'}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={(e) => handleToggleDetach(e, t)}
                        disabled={toggleDetach.isPending}
                        className="inline-flex items-center gap-1.5"
                      >
                        {t.detached ? (
                          <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-300 gap-1 cursor-pointer hover:bg-gray-200">
                            <Unlink className="w-3 h-3" /> Detached
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 gap-1 cursor-pointer hover:bg-green-100">
                            <Link className="w-3 h-3" /> Attached
                          </Badge>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      {t.latitude != null && t.longitude != null ? (
                        <a
                          href={googleMapsUrl(t.latitude, t.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Google Maps
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <VehicleMovementsDialog
        open={movementsOpen}
        onClose={() => { setMovementsOpen(false); setSelectedVehicle(null); }}
        vehicle={selectedVehicle}
      />
    </div>
  );
}