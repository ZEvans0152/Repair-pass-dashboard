import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

// Bump the version whenever UPDATES change to re-show the popup to everyone
const VERSION = '2026-06-16';
const UPDATES = [
  'Email alerts now come from "CAA Vehicle Dispatch" — status changes (departures, returns, pickups) are sent automatically.',
  'Send Out Form can now be emailed directly to stakeholders with a single click, in addition to PDF download.',
  'Bring Back Request notifications include the dealership address so recipients can quickly set up Outlook rules.',
  'New Repair Pass looks up stock numbers in Cognosos and prefills VIN, Make, Model, Color, and Client automatically.',
  'Vehicles not found in Cognosos can still be added manually and are marked "No Tracker".',
];

const STORAGE_KEY = 'whats_new_seen_version';

export default function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== VERSION) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, VERSION);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Sparkles className="w-5 h-5 text-orange-500" /> What's New
          </DialogTitle>
          <DialogDescription>Recent updates to the Repair Pass Tracker</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {UPDATES.map((u, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
              <span>{u}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}