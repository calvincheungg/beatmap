/** Pins this close, in metres, count as the same building. */
const SAME_BUILDING_METRES = 20;
/** The widest slot the pin layers can draw. Six pins side by side is more than any building here has. */
export const MAX_PIN_SLOT = 5;

export interface PinPlace {
  id: string;
  lat: number;
  lon: number;
}

function metresBetween(a: PinPlace, b: PinPlace): number {
  const toRadians = Math.PI / 180;
  const x = (b.lon - a.lon) * toRadians * Math.cos(((a.lat + b.lat) / 2) * toRadians);
  const y = (b.lat - a.lat) * toRadians;
  return Math.hypot(x, y) * 6371000;
}

/**
 * Gives pins in the same building a sideways slot, so they sit side by side rather than stacking.
 * Slots are centred on the building, in half-pin steps: two pins get -1 and 1, three get -2, 0 and 2.
 * Venues not in the result stand alone, at slot 0.
 */
export function pinSlots(places: PinPlace[]): Map<string, number> {
  const slots = new Map<string, number>();
  const placed = new Set<string>();
  for (const place of places) {
    if (placed.has(place.id)) continue;
    const group = places.filter((other) => !placed.has(other.id) && metresBetween(place, other) <= SAME_BUILDING_METRES);
    if (group.length < 2) continue;
    // West to east, so the order on screen is stable. Ties keep their list order.
    const ordered = [...group].sort((a, b) => a.lon - b.lon);
    ordered.forEach((member, index) => {
      placed.add(member.id);
      slots.set(member.id, Math.max(-MAX_PIN_SLOT, Math.min(MAX_PIN_SLOT, index * 2 - (ordered.length - 1))));
    });
  }
  return slots;
}
