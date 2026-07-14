import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
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
  const { toast } = useToast();

  // Fetch only active (non-archived) passes so the limit never pushes
  // older active vehicles off the dashboard as history grows.
  const { data: passes = [] } = useQuery({
    queryKey: ['repairPasses'],
    queryFn: () => base44.entities.RepairPass.filter({ archived: false }, '-created_date', 200),
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RepairPass.create({
      ...data,
      status: 'pending_departure',
      ...(data.notes ? { latest_note: data.notes, latest_note_at: new Date().toISOString() } : {}),
    }),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ['repairPasses'] });
      setShowForm(false);
      // Immediately check Cognosos for this unit's location (just this unit,
      // not a full sync of every tracker on the lot)
      await base44.functions.invoke('syncCognososLocations', created?.id ? { only_pass_id: created.id } : {});
      queryClient.invalidateQueries({ queryKey: ['repairPasses'] });
    },
    onError: (err) => toast({
      variant: 'destructive',
      title: 'Failed to create repair pass',
      description: err?.message || 'Please try again.',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RepairPass.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repairPasses'] }),
    onError: (err) => toast({
      variant: 'destructive',
      title: 'Update failed',
      description: err?.message || 'The change was not saved. Please try again.',
    }),
  });

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
              passes={passes}
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
