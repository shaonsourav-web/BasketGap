const UNIT_NORMALISERS: Array<[RegExp, string]> = [
  [/\b(litres?|lts?|l)\b/gi, 'L'],
  [/\b(millilitres?|mls?|ml)\b/gi, 'ml'],
  [/\b(kilograms?|kilos?|kgs?|kg)\b/gi, 'kg'],
  [/\b(grams?|gms?|gm|g)\b/gi, 'g'],
  [/\b(each|ea)\b/gi, 'ea'],
  [/\b(packs?|pkts?|pk)\b/gi, 'pack'],
  [/\b(dozen|doz|dz)\b/gi, 'dozen'],
];

export function cleanLine(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[^a-z0-9.'\s-]/g, ' ');
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
