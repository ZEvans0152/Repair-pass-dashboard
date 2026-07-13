import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import RepairPassTimestampEditor from '@/components/repair/RepairPassTimestampEditor';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ alert_email: '' });

  const { data: settings } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => (await base44.entities.AppSettings.list())[0] || null,
  });

  useEffect(() => {
    if (settings) {
      setForm({ alert_email: settings.alert_email || '' });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) =>
      settings
        ? base44.entities.AppSettings.update(settings.id, data)
        : base44.entities.AppSettings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Settings saved');
    },
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-heading font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Alerts and reminders configuration</p>
      </div>

      <RepairPassTimestampEditor />

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Email Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate({ ...form });
            }}
            className="space-y-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Alert email</Label>
              <Input
                id="email"
                type="email"
                placeholder="manager@dealership.com"
                value={form.alert_email}
                onChange={(e) => setForm({ ...form, alert_email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Alerts and daily reminders are sent here. Separate multiple addresses with commas.</p>
            </div>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-primary hover:bg-primary/90">
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}