import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';

import StatsCards from '../components/repair/StatsCards';
import RepairPassTable from '../components/repair/RepairPassTable';
import RepairPassForm from '../components/repair/RepairPassForm';
import VehicleDetailDialog from '../components/repair/VehicleDetailDialog';
import SendOutFormDialog from '../components/repair/SendOutFormDialog';

export default function Dashboard() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPass, setSelectedPass] = useState(null);
  const [sendOutPass, setSendOutPass] = useState(null);
  const queryClient = useQueryClient();

  const { data: passes = [] } = useQuery({
    queryKey: ['repairPasses'],
    queryFn: () => base44.entities.RepairPass.list('-created_date', 200),
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RepairPass.create({
      ...data,
      status: 'pending_departure',
      ...(data.notes ? { latest_note: data.notes, latest_note_at: new Date().toISOString() } : {}),
    }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['repairPasses'] });
      setShowForm(false);
      // Immediately check Cognosos for this unit's location
      await base44.functions.invoke('syncCognososLocations', {});
      queryClient.invalidateQueries({ queryKey: ['repairPasses'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RepairPass.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repairPasses'] }),
  });

  const active = passes.filter((p) => !p.archived);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">Repair Pass Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Live tracking of vehicles out at dealerships</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> New Repair Pass
        </Button>
      </div>

      <StatsCards passes={passes} />

      <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Active Repair Passes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RepairPassTable
              passes={active}
              onMarkDeparted={(p) =>
                updateMutation.mutate({ id: p.id, data: { status: 'out', departure_time: new Date().toISOString() } })
              }
              onMarkReturned={(p) =>
                updateMutation.mutate({ id: p.id, data: { status: 'returned', return_time: new Date().toISOString() } })
              }
              onMarkPickup={(p) => updateMutation.mutate({ id: p.id, data: { status: 'sent_for_pickup', sent_for_pickup_time: new Date().toISOString() } })}
              onArchive={(p) => updateMutation.mutate({ id: p.id, data: { archived: true } })}
              onRowClick={(p) => setSelectedPass(p)}
              onSendOutForm={(p) => setSendOutPass(p)}
            />
        </CardContent>
      </Card>

      <VehicleDetailDialog
        pass={selectedPass}
        open={!!selectedPass}
        onOpenChange={(open) => !open && setSelectedPass(null)}
      />

      <SendOutFormDialog
        pass={sendOutPass}
        open={!!sendOutPass}
        onOpenChange={(open) => !open && setSendOutPass(null)}
      />

      <RepairPassForm
        open={showForm}
        onOpenChange={setShowForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
    </div>
  );
}