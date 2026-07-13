import { Badge } from '@/components/ui/badge';
import { Clock, ArrowUpRight, CheckCircle2, Truck } from 'lucide-react';

const config = {
  pending_departure: { label: 'Pending Departure', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: Clock },
  out: { label: 'Out on Repair Pass', cls: 'bg-orange-100 text-orange-800 border-orange-200', Icon: ArrowUpRight },
  sent_for_pickup: { label: 'Sent for Pick-up', cls: 'bg-blue-100 text-blue-800 border-blue-200', Icon: Truck },
  returned: { label: 'Returned', cls: 'bg-green-100 text-green-800 border-green-200', Icon: CheckCircle2 },
};

export default function StatusBadge({ status }) {
  const { label, cls, Icon } = config[status] || config.pending_departure;
  return (
    <Badge variant="outline" className={`${cls} gap-1 font-medium whitespace-nowrap`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}