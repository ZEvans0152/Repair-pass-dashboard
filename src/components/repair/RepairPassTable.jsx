import { useState } from 'react';
import { formatDistanceToNowStrict, formatDistanceStrict } from 'date-fns';
import { formatET } from '@/lib/time';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, MapPin, ArrowUpRight, CheckCircle2, Archive, Truck, StickyNote, FileText, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { cn } from '@/lib/utils';

const STATUS_ORDER = { out: 1, sent_for_pickup: 2, pending_departure: 3, returned: 4 };

function sortPasses(passes, key, dir) {
  if (!key) return passes;
  return [...passes].sort((a, b) => {
    let av, bv;
    if (key === 'vehicle') { av = `${a.make} ${a.model}`; bv = `${b.make} ${b.model}`; }
    else if (key === 'status') { av = STATUS_ORDER[a.status] ?? 99; bv = STATUS_ORDER[b.status] ?? 99; }
    else if (key === 'departure_time') { av = a.departure_time ? new Date(a.departure_time).getTime() : 0; bv = b.departure_time ? new Date(b.departure_time).getTime() : 0; }
    else { av = (a[key] || '').toString().toLowerCase(); bv = (b[key] || '').toString().toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 ml-1 inline" />
    : <ChevronDown className="w-3 h-3 ml-1 inline" />;
}

export default function RepairPassTable({ passes, onMarkDeparted, onMarkReturned, onMarkPickup, onArchive, onRowClick, onSendOutForm, showActions = true }) {
  const [sortKey, setSortKey] = useState('status');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = sortPasses(passes, sortKey, sortDir);

  const SH = ({ col, children }) => (
    <TableHead onClick={() => handleSort(col)} className="cursor-pointer select-none whitespace-nowrap hover:text-foreground">
      {children}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </TableHead>
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <SH col="vin">VIN</SH>
            <SH col="vehicle">Vehicle</SH>
            <SH col="stock_number">Stock #</SH>
            <SH col="client">Client</SH>
            <SH col="dealership">Dealership</SH>
            <SH col="reason">Reason</SH>
            <SH col="status">Status</SH>
            <SH col="departure_time">Departed</SH>
            <TableHead>Time Out</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Last Update</TableHead>
            {showActions && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell               colSpan={showActions ? 12 : 11}  className="text-center text-muted-foreground py-10">
                No repair passes found.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((p) => (
            <TableRow
              key={p.id}
              onClick={() => onRowClick && onRowClick(p)}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              <TableCell className="font-mono text-xs">{p.vin}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">
                <div>{p.make} {p.model}</div>
                {(p.latest_note || p.notes) && (
                  <div className="flex items-start gap-1 text-xs text-muted-foreground font-normal max-w-[260px] whitespace-normal">
                    <StickyNote className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      {p.latest_note || p.notes}
                      {p.latest_note_at && (
                        <span className="block text-[11px] text-muted-foreground/70">
                          {formatET(p.latest_note_at, true)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell>{p.stock_number}</TableCell>
              <TableCell>{p.client || '—'}</TableCell>
              <TableCell>{p.dealership || '—'}</TableCell>
              <TableCell className="max-w-[160px] truncate text-sm" title={p.reason}>{p.reason || '—'}</TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {p.departure_time ? formatET(p.departure_time) : '—'}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {p.departure_time && !p.return_time
                  ? formatDistanceToNowStrict(new Date(p.departure_time))
                  : p.return_time && p.departure_time
                    ? formatDistanceStrict(new Date(p.departure_time), new Date(p.return_time))
                    : '—'}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  {/left\s*(lot|site)/i.test(p.current_zone || '') || p.status === 'out' || p.status === 'sent_for_pickup' ? (
                    <span className="text-xs font-medium text-orange-600 whitespace-nowrap">Off lot</span>
                  ) : p.last_location_update || p.current_zone ? (
                    <span className="text-xs font-medium text-green-700 whitespace-nowrap">
                      {p.current_zone && p.current_zone !== 'On Lot' ? `On lot · ${p.current_zone}` : 'On lot'}
                    </span>
                  ) : null}
                  {p.no_tracker ? (
                    <span className="text-muted-foreground text-xs whitespace-nowrap">No tracker</span>
                  ) : (p.current_lat || p.cognosos_asset_id) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRowClick && onRowClick(p); }}
                      className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                    >
                      <MapPin className="w-3.5 h-3.5" /> View Map
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-sm">No GPS</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {p.last_location_update ? formatET(p.last_location_update) : '—'}
              </TableCell>
              {showActions && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onSendOutForm && (
                        <DropdownMenuItem onClick={() => onSendOutForm(p)}>
                          <FileText className="w-4 h-4 mr-2 text-slate-600" /> Send Out Form
                        </DropdownMenuItem>
                      )}
                      {p.status === 'pending_departure' && (
                        <DropdownMenuItem onClick={() => onMarkDeparted(p)}>
                          <ArrowUpRight className="w-4 h-4 mr-2 text-orange-600" /> Mark as Departed
                        </DropdownMenuItem>
                      )}
                      {p.status === 'out' && onMarkPickup && (
                        <DropdownMenuItem onClick={() => onMarkPickup(p)}>
                          <Truck className="w-4 h-4 mr-2 text-blue-600" /> Send for Pick-Up
                        </DropdownMenuItem>
                      )}
                      {(p.status === 'out' || p.status === 'sent_for_pickup') && (
                        <DropdownMenuItem onClick={() => onMarkReturned(p)}>
                          <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> Mark as Returned
                        </DropdownMenuItem>
                      )}
                      {p.status === 'returned' && onArchive && (
                        <DropdownMenuItem onClick={() => onArchive(p)}>
                          <Archive className="w-4 h-4 mr-2 text-slate-500" /> Archive to History
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}