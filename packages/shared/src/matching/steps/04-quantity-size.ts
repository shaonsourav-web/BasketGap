export interface QuantitySizeExtract {
  residual: string;
  quantity: number | null;
  sizeValue: number | null;
  sizeUom: string | null;
}

const SIZE_PATTERNS: Array<{ regex: RegExp; uom: string }> = [
  { regex: /(\d+(?:\.\d+)?)\s*L\b/g, uom: 'L' },
  { regex: /(\d+(?:\.\d+)?)\s*ml\b/gi, uom: 'ml' },
  { regex: /(\d+(?:\.\d+)?)\s*kg\b/g, uom: 'kg' },
  { regex: /(\d+(?:\.\d+)?)\s*g\b/g, uom: 'g' },
];

const PACK_PATTERN = /(?:^|\s)(\d+)\s*(?:x|pack|pk|pkt)\b/gi;
const X_PACK_PATTERN = /(?:^|\s)x\s*(\d+)\b/gi;
const DOZEN_PATTERN = /(\d+)?\s*doz(?:en|\.|\b)/gi;

export function extractQuantitySize(input: string): QuantitySizeExtract {
  let residual = input;
  let quantity: number | null = null;
  let sizeValue: number | null = null;
  let sizeUom: string | null = null;

  for (const { regex, uom } of SIZE_PATTERNS) {
    regex.lastIndex = 0;
    const match = regex.exec(residual);
    if (match && match[1]) {
      sizeValue = Number.parseFloat(match[1]);
      sizeUom = uom;
      residual = residual.replace(match[0], ' ').trim();
      break;
    }
  }

  PACK_PATTERN.lastIndex = 0;
  const packMatch = PACK_PATTERN.exec(residual);
  if (packMatch && packMatch[1]) {
    quantity = Number.parseInt(packMatch[1], 10);
    residual = residual.replace(packMatch[0], ' ').trim();
  } else {
    X_PACK_PATTERN.lastIndex = 0;
    const xMatch = X_PACK_PATTERN.exec(residual);
    if (xMatch && xMatch[1]) {
      quantity = Number.parseInt(xMatch[1], 10);
      residual = residual.replace(xMatch[0], ' ').trim();
    }
  }

  DOZEN_PATTERN.lastIndex = 0;
  const dozMatch = DOZEN_PATTERN.exec(residual);
  if (dozMatch) {
    const multiplier = dozMatch[1] ? Number.parseInt(dozMatch[1], 10) : 1;
    quantity = (quantity ?? 1) * multiplier * 12;
    residual = residual.replace(dozMatch[0], ' ').trim();
  }

  // Leftover bare numbers ("1.25 coke", "2 red onion") and orphan pack/each
  // tokens carry no product identity; strip them so they stop diluting the
  // name-similarity query. An integer becomes the quantity when none was set.
  const bareNumber = /(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/;
  const bareMatch = bareNumber.exec(residual);
  if (bareMatch && bareMatch[1]) {
    if (quantity == null && Number.isInteger(Number(bareMatch[1])) && Number(bareMatch[1]) <= 24) {
      quantity = Number.parseInt(bareMatch[1], 10);
    }
    residual = residual.replace(bareMatch[0], ' ');
  }
  residual = residual.replace(/\b(pack|ea)\b/g, ' ');

  residual = residual.replace(/\s+/g, ' ').trim();
  return { residual, quantity, sizeValue, sizeUom };
}
