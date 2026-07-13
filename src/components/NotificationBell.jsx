import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => base44.entities.Notification.list('-created_date', 50),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = (open) => {
    setOpen(open);
    if (open) {
      // Mark all as read
      const unread = notifications.filter((n) => !n.read);
      unread.forEach((n) => markReadMutation.mutate(n.id));
    }
  };

  const typeStyles = {
    departed: 'border-l-orange-500',
    returned: 'border-l-green-500',
    overdue: 'border-l-red-500',
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 mr-4" align="end">
        <div className="px-4 py-3 border-b">
          <p className="font-semibold text-sm">Notifications</p>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'px-4 py-3 border-l-[3px] hover:bg-muted/50 transition-colors',
                  typeStyles[n.type] || 'border-l-muted',
                  !n.read && 'bg-primary/5'
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <Circle className="w-2 h-2 mt-1.5 fill-blue-500 text-blue-500 shrink-0" />}
                  <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    {new Date(n.created_date).toLocaleString()}
                  </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}