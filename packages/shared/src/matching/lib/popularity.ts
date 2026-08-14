const SATURATION_HITS = 20;

/**
 * Maps accumulated match_cache hit counts onto a saturating [0, 1) prior.
 * Monotonic in hits; reaches 0.5 at SATURATION_HITS and approaches 1
 * asymptotically, so popular staples get a nudge without ever letting
 * popularity alone outrank text/vector evidence.
 */
export function hitsToPrior(hits: number): number {
  if (!Number.isFinite(hits) || hits <= 0) return 0;
  return hits / (hits + SATURATION_HITS);
}
