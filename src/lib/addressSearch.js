import { base44 } from '@/api/base44Client';

let lotCenterPromise = null;

// Use the lot center from app settings as the search proximity —
// deterministic and doesn't depend on browser location permissions.
function getLotCenter() {
  if (!lotCenterPromise) {
    lotCenterPromise = base44.entities.AppSettings.list()
      .then((list) => {
        const s = list[0];
        return s?.lot_lat != null && s?.lot_lng != null ? { lat: s.lot_lat, lng: s.lot_lng } : null;
      })
      .catch(() => null);
  }
  return lotCenterPromise;
}

export async function fetchAddressSuggestions(query) {
  if (!query || query.trim().length < 3) return [];
  const loc = await getLotCenter();
  const res = await base44.functions.invoke('searchAddresses', {
    query: query.trim(),
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
  });
  return res.data?.suggestions || [];
}