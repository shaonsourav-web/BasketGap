export interface BaseSize {
  value: number;
  uom: string;
}

const TO_BASE: Record<string, { uom: string; factor: number }> = {
  g: { uom: 'g', factor: 1 },
  kg: { uom: 'g', factor: 1000 },
  ml: { uom: 'ml', factor: 1 },
  L: { uom: 'ml', factor: 1000 },
};

/**
 * Normalise a size to its base unit (g for mass, ml for volume) so that
 * equivalent sizes expressed in different units compare equal
 * (500 g ≡ 0.5 kg, 2 L ≡ 2000 ml). Unknown units pass through unchanged.
 */
export function toBaseUnit(value: number, uom: string): BaseSize {
  const entry = TO_BASE[uom];
  if (!entry) return { value, uom };
  return { value: value * entry.factor, uom: entry.uom };
}
