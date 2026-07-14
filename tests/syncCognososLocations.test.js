import { describe, it, expect } from 'vitest';
import {
  isOffLotZone,
  distanceMeters,
  escapeHtml,
  computeSyncChanges,
  canSkipWrite,
} from '../base44/functions/syncCognososLocations/entry.ts';

const NOW = '2026-07-14T12:00:00.000Z';
const LOT = { lotLat: 34.5034, lotLng: -82.6501 };

function makePass(overrides = {}) {
  return {
    id: 'pass-1',
    status: 'pending_departure',
    pending_transition: '',
    make: 'Ford',
    model: 'F-150',
    vin: '1FTFW1ET5DFC10312',
    stock_number: '12345',
    ...overrides,
  };
}

function makeNode(overrides = {}) {
  return {
    id: 'node-1',
    asset_identifier: '12345',
    current_zone_text: '',
    latitude: LOT.lotLat,
    longitude: LOT.lotLng,
    ...overrides,
  };
}

describe('isOffLotZone', () => {
  it('matches Left Lot / Left Site in any case', () => {
    expect(isOffLotZone('Left Lot')).toBe(true);
    expect(isOffLotZone('left site')).toBe(true);
    expect(isOffLotZone('LEFT LOT')).toBe(true);
  });

  it('does not match on-lot zones or empty values', () => {
    expect(isOffLotZone('Main Lot')).toBe(false);
    expect(isOffLotZone('On Lot')).toBe(false);
    expect(isOffLotZone('')).toBe(false);
    expect(isOffLotZone(undefined)).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('returns 0 for the same point', () => {
    expect(distanceMeters(34.5, -82.65, 34.5, -82.65)).toBe(0);
  });

  it('returns ~111km for one degree of latitude', () => {
    const d = distanceMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112500);
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('Smith & Sons "Auto"')).toBe('Smith &amp; Sons &quot;Auto&quot;');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('computeSyncChanges — departures', () => {
  it('arms the pending transition on the first off-lot sighting', () => {
    const { changes, notificationType } = computeSyncChanges({
      pass: makePass(),
      node: makeNode({ current_zone_text: 'Left Lot' }),
      movement: null,
      ...LOT,
      now: NOW,
    });
    expect(changes.pending_transition).toBe('departed');
    expect(changes.status).toBeUndefined();
    expect(notificationType).toBeNull();
  });

  it('commits the departure on the second consecutive off-lot sighting', () => {
    const { changes, notificationType } = computeSyncChanges({
      pass: makePass({ pending_transition: 'departed' }),
      node: makeNode({ current_zone_text: 'Left Lot' }),
      movement: null,
      ...LOT,
      now: NOW,
    });
    expect(changes.status).toBe('out');
    expect(changes.departure_time).toBe(NOW);
    expect(changes.pending_transition).toBe('');
    expect(notificationType).toBe('departed');
  });

  it('uses the off-lot movement timestamp as the departure time when available', () => {
    const { changes } = computeSyncChanges({
      pass: makePass({ pending_transition: 'departed' }),
      node: makeNode({ current_zone_text: 'Left Lot' }),
      movement: { zone: { name: 'Left Lot' }, date: { entered: '2026-07-14T09:30:00Z' } },
      ...LOT,
      now: NOW,
    });
    expect(changes.status).toBe('out');
    expect(changes.departure_time).toBe('2026-07-14T09:30:00.000Z');
  });

  it('never uses a stale off-lot movement event as the zone fallback', () => {
    // Node reports no zone; latest movement is an old un-exited "Left Lot" entry.
    // The vehicle must NOT be armed for departure off that stale event alone.
    const { changes } = computeSyncChanges({
      pass: makePass(),
      node: makeNode({ current_zone_text: '', latitude: null, longitude: null }),
      movement: { zone: { name: 'Left Lot' }, date: { entered: '2026-07-10T09:00:00Z' } },
      lotLat: null,
      lotLng: null,
      now: NOW,
    });
    expect(changes.current_zone).toBe('');
    expect(changes.pending_transition).toBe('');
  });
});

describe('computeSyncChanges — returns', () => {
  const outPass = () => makePass({
    status: 'out',
    departure_time: '2026-07-13T15:00:00.000Z',
  });
  const returnMovement = { zone: { name: 'Main Lot' }, date: { entered: '2026-07-14T11:00:00Z' } };

  it('arms the return on the first on-lot sighting', () => {
    const { changes, notificationType } = computeSyncChanges({
      pass: outPass(),
      node: makeNode({ current_zone_text: 'Main Lot' }),
      movement: returnMovement,
      ...LOT,
      now: NOW,
    });
    expect(changes.pending_transition).toBe('returned');
    expect(changes.status).toBeUndefined();
    expect(notificationType).toBeNull();
  });

  it('commits the return on the second consecutive on-lot sighting', () => {
    const { changes, notificationType } = computeSyncChanges({
      pass: { ...outPass(), pending_transition: 'returned' },
      node: makeNode({ current_zone_text: 'Main Lot' }),
      movement: returnMovement,
      ...LOT,
      now: NOW,
    });
    expect(changes.status).toBe('returned');
    expect(changes.return_time).toBe('2026-07-14T11:00:00.000Z');
    expect(notificationType).toBe('returned');
  });

  it('does not arm a return when GPS is far from the lot', () => {
    const { changes } = computeSyncChanges({
      pass: outPass(),
      node: makeNode({ current_zone_text: 'Main Lot', latitude: LOT.lotLat + 0.1 }),
      movement: returnMovement,
      ...LOT,
      now: NOW,
    });
    expect(changes.pending_transition).toBe('');
  });

  it('does not arm a return on an empty (ambiguous) zone', () => {
    const { changes } = computeSyncChanges({
      pass: outPass(),
      node: makeNode({ current_zone_text: '' }),
      movement: null,
      lotLat: null,
      lotLng: null,
      now: NOW,
    });
    expect(changes.pending_transition).toBe('');
  });

  it('does not arm a return when the movement entry predates the departure', () => {
    const { changes } = computeSyncChanges({
      pass: outPass(),
      node: makeNode({ current_zone_text: 'Main Lot' }),
      movement: { zone: { name: 'Main Lot' }, date: { entered: '2026-07-12T08:00:00Z' } },
      ...LOT,
      now: NOW,
    });
    expect(changes.pending_transition).toBe('');
  });
});

describe('computeSyncChanges — zone labelling', () => {
  it('labels an on-lot vehicle "On Lot" from GPS when no zone is reported', () => {
    const { changes } = computeSyncChanges({
      pass: makePass(),
      node: makeNode({ current_zone_text: '' }),
      movement: null,
      ...LOT,
      now: NOW,
    });
    expect(changes.current_zone).toBe('On Lot');
  });

  it('records GPS coordinates when the node has them', () => {
    const { changes } = computeSyncChanges({
      pass: makePass(),
      node: makeNode(),
      movement: null,
      ...LOT,
      now: NOW,
    });
    expect(changes.current_lat).toBe(LOT.lotLat);
    expect(changes.current_lng).toBe(LOT.lotLng);
    expect(changes.last_location_update).toBe(NOW);
  });

  it('falls back to the last un-exited on-lot movement zone', () => {
    const { changes } = computeSyncChanges({
      pass: makePass({ status: 'returned' }),
      node: makeNode({ current_zone_text: '', latitude: null, longitude: null }),
      movement: { zone: { name: 'Service Row' }, date: { entered: '2026-07-14T10:00:00Z' } },
      lotLat: null,
      lotLng: null,
      now: NOW,
    });
    expect(changes.current_zone).toBe('Service Row');
  });
});

describe('canSkipWrite', () => {
  const fiveMinAgo = new Date(new Date(NOW).getTime() - 5 * 60 * 1000).toISOString();
  const twentyMinAgo = new Date(new Date(NOW).getTime() - 20 * 60 * 1000).toISOString();

  const steadyPass = () => makePass({
    current_zone: 'On Lot',
    pending_transition: '',
    current_lat: LOT.lotLat,
    current_lng: LOT.lotLng,
    last_location_update: fiveMinAgo,
  });
  const steadyChanges = () => ({
    current_zone: 'On Lot',
    pending_transition: '',
    current_lat: LOT.lotLat,
    current_lng: LOT.lotLng,
    last_location_update: NOW,
  });

  it('skips when nothing changed and the timestamp is fresh', () => {
    expect(canSkipWrite(steadyPass(), steadyChanges(), null, NOW)).toBe(true);
  });

  it('writes when the stored timestamp is getting stale', () => {
    const pass = { ...steadyPass(), last_location_update: twentyMinAgo };
    expect(canSkipWrite(pass, steadyChanges(), null, NOW)).toBe(false);
  });

  it('writes when the zone changed', () => {
    const changes = { ...steadyChanges(), current_zone: 'Left Lot' };
    expect(canSkipWrite(steadyPass(), changes, null, NOW)).toBe(false);
  });

  it('writes when the coordinates changed', () => {
    const changes = { ...steadyChanges(), current_lat: LOT.lotLat + 0.01 };
    expect(canSkipWrite(steadyPass(), changes, null, NOW)).toBe(false);
  });

  it('writes on any status transition or notification', () => {
    expect(canSkipWrite(steadyPass(), { ...steadyChanges(), status: 'out' }, null, NOW)).toBe(false);
    expect(canSkipWrite(steadyPass(), steadyChanges(), 'departed', NOW)).toBe(false);
  });

  it('writes when the no_tracker flag is being cleared', () => {
    const changes = { ...steadyChanges(), no_tracker: false };
    expect(canSkipWrite(steadyPass(), changes, null, NOW)).toBe(false);
  });

  it('writes when the pass has never been stamped', () => {
    const pass = { ...steadyPass(), last_location_update: undefined };
    expect(canSkipWrite(pass, steadyChanges(), null, NOW)).toBe(false);
  });
});
