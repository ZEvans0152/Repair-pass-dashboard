import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Builds autocomplete suggestions from all previous repair passes (newest first,
// so the most recent info for each name wins).
export default function useFormSuggestions(enabled) {
  const { data } = useQuery({
    queryKey: ['formSuggestions'],
    queryFn: () => base44.entities.RepairPass.list('-updated_date', 1000),
    enabled: !!enabled,
    staleTime: 60000,
  });

  const dealerships = new Map();
  const auctionContacts = new Map();
  const dealerContacts = new Map();

  for (const p of data || []) {
    if (p.dealership && !dealerships.has(p.dealership.toLowerCase())) {
      dealerships.set(p.dealership.toLowerCase(), {
        label: p.dealership,
        sub: p.dealership_address || '',
        data: { address: p.dealership_address || '', contact: p.dealer_contact || '', phone: p.dealer_phone || '' },
      });
    }
    if (p.auction_contact && !auctionContacts.has(p.auction_contact.toLowerCase())) {
      auctionContacts.set(p.auction_contact.toLowerCase(), {
        label: p.auction_contact,
        sub: p.auction_phone || '',
        data: { phone: p.auction_phone || '' },
      });
    }
    if (p.dealer_contact && !dealerContacts.has(p.dealer_contact.toLowerCase())) {
      dealerContacts.set(p.dealer_contact.toLowerCase(), {
        label: p.dealer_contact,
        sub: p.dealer_phone || '',
        data: { phone: p.dealer_phone || '' },
      });
    }
  }

  return {
    dealerships: [...dealerships.values()],
    auctionContacts: [...auctionContacts.values()],
    dealerContacts: [...dealerContacts.values()],
  };
}