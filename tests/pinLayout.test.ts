import { describe, expect, it } from 'vitest';
import { venues } from '../src/data/venues';
import { MAX_PIN_SLOT, pinSlots } from '../src/map/pinLayout';

const place = (id: string, lat: number, lon: number) => ({ id, lat, lon });

describe('pinSlots', () => {
  it('leaves separate buildings alone', () => {
    expect(pinSlots([place('a', 43.65, -79.38), place('b', 43.66, -79.39)]).size).toBe(0);
  });

  it('sets two pins at one spot either side of it', () => {
    const slots = pinSlots([place('a', 43.65, -79.38), place('b', 43.65, -79.38)]);
    expect([slots.get('a'), slots.get('b')]).toEqual([-1, 1]);
  });

  it('centres three pins, keeping the middle one in place', () => {
    const slots = pinSlots([place('a', 43.65, -79.38), place('b', 43.65, -79.38), place('c', 43.65, -79.38)]);
    expect([...slots.values()]).toEqual([-2, 0, 2]);
  });

  it('groups pins a few metres apart, and orders them west to east', () => {
    const slots = pinSlots([place('east', 43.65, -79.38), place('west', 43.65, -79.3801)]);
    expect(slots.get('west')).toBe(-1);
    expect(slots.get('east')).toBe(1);
  });

  it('never goes past the widest slot the layers can draw', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => place(String(i), 43.65, -79.38));
    for (const slot of pinSlots(crowd).values()) expect(Math.abs(slot)).toBeLessThanOrEqual(MAX_PIN_SLOT);
  });

  it('fits every building in the real list', () => {
    const slots = pinSlots(venues);
    expect(slots.has('standard-time')).toBe(true);
    expect(slots.has('the-sound-garage')).toBe(true);
    for (const slot of slots.values()) expect(Math.abs(slot)).toBeLessThanOrEqual(MAX_PIN_SLOT);
  });
});
