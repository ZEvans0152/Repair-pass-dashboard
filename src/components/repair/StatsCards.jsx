import { Card, CardContent } from '@/components/ui/card';
import { Clock, ArrowUpRight, CheckCircle2, Truck } from 'lucide-react';

export default function StatsCards({ passes }) {
  const stats = [
    { label: 'Pending Departure', value: passes.filter((p) => p.status === 'pending_departure').length, Icon: Clock, color: 'text-yellow-600 bg-yellow-100' },
    { label: 'Out on Pass', value: passes.filter((p) => p.status === 'out').length, Icon: ArrowUpRight, color: 'text-orange-600 bg-orange-100' },
    { label: 'Sent for Pickup', value: passes.filter((p) => p.status === 'sent_for_pickup').length, Icon: Truck, color: 'text-blue-600 bg-blue-100' },
    { label: 'Returned', value: passes.filter((p) => p.status === 'returned').length, Icon: CheckCircle2, color: 'text-green-600 bg-green-100' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, Icon, color }) => (
        <Card key={label} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}