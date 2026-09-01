const UNIT_NORMALISERS: Array<[RegExp, string]> = [
  [/\b(litres?|lts?|l)\b/gi, 'L'],
  [/\b(millilitres?|mls?|ml)\b/gi, 'ml'],
  [/\b(kilograms?|kilos?|kgs?|kg)\b/gi, 'kg'],
  [/\b(grams?|gms?|gm|g)\b/gi, 'g'],
  [/\b(each|ea)\b/gi, 'ea'],
  [/\b(packs?|pkts?|pk)\b/gi, 'pack'],
  [/\b(dozen|doz|dz)\b/gi, 'dozen'],
];

/**
 * Store names carry no product identity and routinely prefix catalogue and
 * typed lines ("coles strawberries", "woolies milk"); no canonical product
 * name contains one, so stripping them only removes similarity noise.
 */
const RETAILER_NOISE = /\b(coles|woolworths|woolies|woolys|aldi|iga|costco)\b/g;

/**
 * Descriptor/container words that appear in NO canonical product name; they
 * only dilute trigram similarity ("fresh lemons", "sour cream tub"). Words that
 * DO appear in canonical names (can, bottle, punnet, rolls, loaf, block, pack)
 * must never be listed here.
 */
// NOT listed (they change which product is meant, so deleting them forges
// confidence): raw (raw vs White Sugar), plain (Plain Flour), grated/shredded
// (grated cheese ≠ a specific block). QC 2026-09-01 F2.
const DESCRIPTOR_NOISE =
  /\b(fresh|boneless|seedless|spreadable|squeezy|button|hass|loose|continental|tub|jar|packet|sleeve|bunch|bulb|punnet|for|the|some|my|a|an|of|big|small|hot|pouring)\b/g;
const CONTAINER_OF =
  /\b(bag|bags|box|boxes|tin|can|jar|bottle|punnet|head|pack|packs|loaf|loaves)s? of\b/g;

export function cleanLine(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[^a-z0-9.'\s-]/g, ' ');
  s = s.replace(RETAILER_NOISE, ' ');
  s = s.replace(CONTAINER_OF, ' ');
  s = s.replace(DESCRIPTOR_NOISE, ' ');
  s = s.replace(
    /(\d)\s*(l|ml|kg|g|gm|gms|kgs|lt|lts|litre|litres|kilo|kilos|kilogram|kilograms|gram|grams|each|ea|pack|packs|pkt|pkts|pk|doz|dz|dozen)\b/gi,
    '$1 $2',
  );
  for (const [pattern, replacement] of UNIT_NORMALISERS) {
    s = s.replace(pattern, replacement);
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
