import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix default marker icon paths for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const onLotIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:28px;height:40px;display:flex;align-items:center;justify-content:center"><svg width="28" height="40" viewBox="0 0 28 40"><ellipse cx="14" cy="36" rx="8" ry="2.5" fill="rgba(0,0,0,0.2)"/><path d="M14 0C6.27 0 0 5.82 0 13c0 10.77 14 27 14 27s14-16.23 14-27C28 5.82 21.73 0 14 0z" fill="#2563eb" stroke="#1e40af" stroke-width="1"/><circle cx="14" cy="12" r="5" fill="white"/></svg></div>',
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -40],
});

const offLotIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center"><svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/><line x1="9" y1="16" x2="19" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><polyline points="15,11 20,16 15,21" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export default function VehicleMap({ lat, lng, vehicleName, zone, status, cognososAssetId }) {
  const isOffLot = status === 'out' || status === 'overdue' || status === 'sent_for_pickup'
    || /left\s*(lot|site)/i.test(zone || '');

  const [satellite, setSatellite] = useState(false);

  if (!lat || !lng) {
    return (
      <div className="h-[220px] bg-muted/50 rounded-lg flex items-center justify-center">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium mb-1">No GPS data available</p>
          {cognososAssetId ? (
            <a
              href={`https://app.cognosos.com/assets/${cognososAssetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              View in Cognosos →
            </a>
          ) : (
            <p>Tracker not linked to this unit</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[220px] rounded-lg overflow-hidden border relative">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution={satellite
            ? '&copy; <a href="https://www.esri.com/">Esri</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
          url={satellite
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <Marker position={[lat, lng]} icon={isOffLot ? offLotIcon : onLotIcon}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{vehicleName}</p>
              {zone && <p className="text-muted-foreground text-xs">{zone}</p>}
              {isOffLot && <p className="text-red-600 text-xs font-medium mt-0.5">Off lot</p>}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
        <button
          onClick={() => setSatellite((s) => !s)}
          className="absolute top-2 right-2 z-[1000] bg-white/90 hover:bg-white text-xs font-medium px-2.5 py-1.5 rounded shadow border transition-colors"
        >
          {satellite ? 'Standard' : 'Satellite'}
        </button>
    </div>
  );
}