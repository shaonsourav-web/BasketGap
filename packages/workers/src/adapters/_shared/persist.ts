import { eq } from 'drizzle-orm';

import type { Db } from '@basketgap/shared/db/client';
import { catalogues, specials } from '@basketgap/shared/db/schema';

import type { IngestResult, ParsedCatalogue } from './types.ts';

export async function persistCatalogue(
  db: Db,
  parsed: ParsedCatalogue,
  options: { forceRefresh: boolean },
): Promise<IngestResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: catalogues.id })
      .from(catalogues)
      .where(eq(catalogues.sourceHash, parsed.sourceHash))
      .limit(1);
    const existingId = existing[0]?.id ?? null;

    if (existingId && !options.forceRefresh) {
      return {
        catalogueId: existingId,
        specialsInserted: 0,
        skipped: true,
        reason: 'catalogue already ingested (matched source_hash)',
        parsed,
      };
    }

    let catalogueId = existingId;

    if (existingId && options.forceRefresh) {
      await tx.delete(specials).where(eq(specials.catalogueId, existingId));
      await tx
        .update(catalogues)
        .set({
          itemCount: parsed.itemCount,
          fetchedAt: new Date(),
          validFrom: dateToSqlDate(parsed.validFrom),
          validTo: dateToSqlDate(parsed.validTo),
          status: parsed.specials.length > 0 ? 'success' : 'partial',
          updatedAt: new Date(),
        })
        .where(eq(catalogues.id, existingId));
    } else {
      const inserted = await tx
        .insert(catalogues)
        .values({
          retailer: parsed.retailer,
          sourceType: parsed.sourceType,
          sourceLabel: parsed.sourceLabel,
          state: null,
          sourceUrl: parsed.sourceUrl,
          sourceHash: parsed.sourceHash,
          fetchedAt: new Date(),
          validFrom: dateToSqlDate(parsed.validFrom),
          validTo: dateToSqlDate(parsed.validTo),
          itemCount: parsed.itemCount,
          status: parsed.specials.length > 0 ? 'success' : 'partial',
        })
        .returning({ id: catalogues.id });
      catalogueId = inserted[0]!.id;
    }

    if (!catalogueId) throw new Error('catalogue id unexpectedly null after insert');

    const rows = parsed.specials.map((special) => ({
      catalogueId,
      retailer: parsed.retailer,
      sourceType: parsed.sourceType,
      sourceLabel: parsed.sourceLabel,
      state: null,
      retailerSku: special.retailerSku,
      productName: special.productName,
      brand: special.brand,
      sizeText: special.sizeText,
      unitSizeValue: special.unitSizeValue != null ? String(special.unitSizeValue) : null,
      unitSizeUom: special.unitSizeUom,
      regularPrice: special.regularPrice != null ? String(special.regularPrice) : null,
      specialPrice: String(special.specialPrice),
      savingsAmount: special.savingsAmount != null ? String(special.savingsAmount) : null,
      savingsPercent: special.savingsPercent != null ? String(special.savingsPercent) : null,
      promoType: special.promoType,
      promoLabel: special.promoLabel,
      multiBuy: special.multiBuy,
      isMemberLocked: special.isMemberLocked,
      validFrom: dateToSqlDate(parsed.validFrom),
      validTo: dateToSqlDate(parsed.validTo),
      sourcePage: special.sourcePage,
      rawText: special.rawText,
      rawPayload: { confidence: special.confidenceScore } as Record<string, unknown>,
      confidenceScore: String(special.confidenceScore),
    }));

    let specialsInserted = 0;
    if (rows.length > 0) {
      const result = await tx
        .insert(specials)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: specials.id });
      specialsInserted = result.length;
    }

    return {
      catalogueId,
      specialsInserted,
      skipped: false,
      reason: existingId ? 'force-refresh: existing catalogue replaced' : 'new catalogue ingested',
      parsed,
    };
  });
}

function dateToSqlDate(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
