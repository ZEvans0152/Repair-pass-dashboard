import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

import RepairPassTable from '../components/repair/RepairPassTable';

export default function HistoryPage() {
  const [search, setSearch] = useState('');

  const { data: passes = [] } = useQuery({
    queryKey: ['repairPassHistory'],
    queryFn: () => base44.entities.RepairPass.filter({ status: 'returned', archived: true }, '-return_time', 500),
  });

  const q = search.toLowerCase();
  const filtered = passes.filter((p) =>
    !q ||
    [p.vin, p.stock_number, p.client, p.dealership, p.make, p.model]
      .some((v) => v && v.toLowerCase().includes(q))
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-heading font-bold">History</h1>
        <p className="text-muted-foreground text-sm mt-1">Completed repair passes</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by VIN, stock #, client, dealership..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Returned Vehicles ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <RepairPassTable passes={filtered} showActions={false} />
        </CardContent>
      </Card>
    </div>
  );
}