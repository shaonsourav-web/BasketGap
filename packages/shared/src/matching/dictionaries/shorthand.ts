// Aussie grocery shorthand → canonical phrasing.
//
// Keys are space-separated phrases; matched as longest-trigram-first, then
// bigrams, then unigrams (see `steps/03-shorthand.ts`).
//
// **Grounding rule:** every expansion must lead to a product that actually
// exists in `seed/canonical-seed.ts`. Entries that expand to nothing the
// catalogue carries only cost lookup time and risk pulling an unrelated
// canonical into the shortlist, so they are not added speculatively.
//
// Expansions are written as the *full* canonical phrasing wherever the slang is
// unambiguous ("evoo" → "olive oil extra virgin"), because the offline ranker's
// boost ladder needs trigram similarity ≥ 0.95 to reach the `matched` band —
// a partial expansion ("evoo" → "olive oil") lands in silence instead.
export const SHORTHAND: Record<string, string> = {
  // ---------------------------------------------------------------- dairy
  fc: 'full cream milk',
  'full cream': 'full cream milk',
  skim: 'skim milk',
  'skinny milk': 'skim milk',
  lite: 'light milk',
  'low fat milk': 'light milk',
  'long life milk': 'uht long life milk',
  'uht milk': 'uht long life milk',
  'shelf milk': 'uht long life milk',
  yog: 'yogurt',
  'greek yogurt': 'greek style yogurt',
  // Keeps the brand token in place — brand extraction (step run after this one)
  // is what should claim "bega", so the expansion only supplies the missing
  // product words.
  'bega tasty': 'bega tasty cheese block',
  'tasty cheddar': 'tasty cheese',
  marg: 'margarine spread',
  'butter substitute': 'margarine spread',

  // --------------------------------------------------------------- bakery
  brekkie: 'breakfast',
  brekky: 'breakfast',
  sanga: 'sandwich',
  sangas: 'sandwiches',
  sango: 'sandwich',
  'sandwich loaf': 'white sandwich bread loaf',
  'white loaf': 'white sandwich bread loaf',
  'wholemeal loaf': 'wholemeal bread loaf',
  'multigrain loaf': 'multigrain bread loaf',

  // ----------------------------------------------------------------- eggs
  'dozen eggs': 'free range eggs dozen',
  'doz eggs': 'free range eggs dozen',
  'free range dozen': 'free range eggs dozen',

  // --------------------------------------------------------------- pantry
  spag: 'spaghetti pasta',
  'spag bol': 'spaghetti bolognese',
  spaghetti: 'spaghetti pasta',
  macaroni: 'macaroni pasta',
  penne: 'penne pasta',
  passata: 'tomato passata',
  'tinned tomatoes': 'diced tomatoes can',
  'canned tomatoes': 'diced tomatoes can',
  'tinned toms': 'diced tomatoes can',
  'tinned tuna': 'tuna in springwater',
  'canned tuna': 'tuna in springwater',
  'tinned lentils': 'lentils can',
  'tinned chickpeas': 'chickpeas can',
  'baked beans': 'baked beans can',
  // NB: no `extra virgin` key — expansions can only absorb the tokens that
  // *follow* them, so expanding a tail phrase would re-emit the head
  // ("olive oil extra virgin" → "olive oil olive oil extra virgin").
  evoo: 'olive oil extra virgin',
  'dead horse': 'tomato sauce bottle',
  'tommy sauce': 'tomato sauce bottle',
  ketchup: 'tomato sauce bottle',
  mayo: 'mayonnaise',
  pb: 'peanut butter',
  porridge: 'rolled oats',
  weetbix: 'weet-bix cereal',
  'weet bix': 'weet-bix cereal',
  weeties: 'weet-bix cereal',
  cuppa: 'tea bags',
  'cup of tea': 'tea bags',
  milo: 'milo chocolate drink',
  vegemite: 'vegemite spread',
  choccy: 'chocolate',
  choc: 'chocolate',

  // -------------------------------------------------------------- produce
  veggies: 'vegetables',
  veggos: 'vegetables',
  veg: 'vegetables',
  spuds: 'potatoes',
  spud: 'potato',
  tatties: 'potatoes',
  avo: 'avocado',
  avos: 'avocados',
  'smashed avo': 'avocado',
  caps: 'capsicum',
  capsicums: 'capsicum',
  mushies: 'mushrooms',
  strawbs: 'strawberries punnet',
  rocket: 'rocket lettuce',
  zucchinis: 'zucchini',
  'cherry toms': 'cherry tomatoes',

  // ----------------------------------------------------------------- meat
  snags: 'sausages',
  snag: 'sausage',
  chook: 'chicken',
  chooks: 'chicken',
  'chook breast': 'chicken breast fillets',
  'chook thigh': 'chicken thigh fillets',
  'roast chook': 'whole roast chicken',
  mince: 'beef mince',
  'lean mince': 'beef mince lean',
  rissoles: 'beef patties',
  rashers: 'bacon rashers',
  'bacon rasher': 'bacon rashers',
  schnitzy: 'chicken schnitzel',
  schnitty: 'chicken schnitzel',
  schnitties: 'chicken schnitzels',
  rump: 'beef steak rump',
  'rump steak': 'beef steak rump',
  porterhouse: 'porterhouse steak',
  'shaved ham': 'sliced ham',
  'leg ham': 'sliced ham',

  // --------------------------------------------------------------- frozen
  'oven chips': 'frozen chips',
  'frozen veg': 'frozen mixed vegetables',
  'mixed veg': 'frozen mixed vegetables',
  'icy pole': 'iceblock',
  'ice block': 'iceblock',

  // --------------------------------------------------------------- snacks
  bickies: 'biscuits',
  biccies: 'biscuits',
  bikkies: 'biscuits',
  bikkie: 'biscuit',
  'tim tam': 'tim tams chocolate biscuits',
  'tim tams': 'tim tams chocolate biscuits',
  timtams: 'tim tams chocolate biscuits',
  'scotch fingers': 'scotch finger biscuits',
  'scotch finger': 'scotch finger biscuits',
  'iced vovos': 'iced vovo biscuits',
  saos: 'sao biscuits',
  jatz: 'jatz biscuits',
  twisties: 'twisties chips',
  'salt n vinegar': 'salt and vinegar chips',
  'plain chips': 'potato chips salted',

  // --------------------------------------------------------------- drinks
  coke: 'coca cola',
  'coca-cola': 'coca cola',
  oj: 'orange juice',
  cordy: 'cordial',
  fizzy: 'soft drink',
  softie: 'soft drink',
  'mineral water': 'sparkling water',
  'soda water': 'sparkling water',
  goon: 'cask wine',
  stubbie: 'beer',
  tinny: 'beer can',
  tinnies: 'beer cans',
  slab: 'beer carton',

  // ------------------------------------------------------------ household
  'loo paper': 'toilet paper',
  'loo roll': 'toilet paper',
  'loo rolls': 'toilet paper',
  'bog roll': 'toilet paper',
  'dunny roll': 'toilet paper',
  'dunny rolls': 'toilet paper',
  'toilet roll': 'toilet paper',
  'toilet rolls': 'toilet paper',
  'paper towels': 'paper towel',
  'kitchen towel': 'paper towel',
  'glad wrap': 'cling wrap',
  gladwrap: 'cling wrap',
  'cling film': 'cling wrap',
  'plastic wrap': 'cling wrap',
  alfoil: 'aluminium foil',
  'tin foil': 'aluminium foil',
  'aluminum foil': 'aluminium foil',
  serviettes: 'napkins',
  detergent: 'dishwashing liquid',
  dishies: 'dishwashing liquid',
  'dish soap': 'dishwashing liquid',
  'dishwashing detergent': 'dishwashing liquid',
  'laundry detergent': 'laundry detergent liquid',
  'laundry liquid': 'laundry detergent liquid',
  'washing liquid': 'laundry detergent liquid',
  'laundry powder': 'laundry detergent powder',
  'washing powder': 'laundry detergent powder',
  'dishwasher tabs': 'dishwasher tablets',
  'dishwasher powder': 'dishwasher tablets',
  'bin bags': 'bin liners kitchen',
  'garbage bags': 'bin liners kitchen',
  'rubbish bags': 'bin liners kitchen',
  'bin liners': 'bin liners kitchen',

  // ------------------------------------------------------------ deli/misc
  cheerios: 'cocktail frankfurts',
  devon: 'devon luncheon meat',
  fritz: 'devon luncheon meat',
  'mi goreng': 'mi goreng noodles',
  barbie: 'bbq',
};

/**
 * Bare heads → the catalogue's default variant for that head.
 *
 * Applied **only when the key is the entire line** once trailing size/pack
 * tokens are removed (see `applyHeadDefault` in `steps/03-shorthand.ts`), which
 * is what makes them safe: "milk 1L" defaults to full cream, while "almond
 * milk", "soy milk" and "skim milk" are untouched because the whole line does
 * not equal `milk`. They exist because a bare head has poor trigram overlap
 * with the longer canonical name it should resolve to ("macaroni" scores 0.56
 * against "Macaroni Pasta"), so without them every one-word staple is silence.
 *
 * Only heads with an obvious, single default belong here. Genuinely ambiguous
 * heads ("chips", "sausages", "oil", "cheese slices vs block" beyond the
 * documented default) are deliberately left out so the engine keeps deferring.
 */
export const HEAD_DEFAULTS: Record<string, string> = {
  // dairy
  milk: 'full cream milk',
  'almond milk': 'almond milk unsweetened',
  cheese: 'tasty cheese block',
  'tasty cheese': 'tasty cheese block',
  'cheese slices': 'tasty cheese slices',
  'sliced cheese': 'tasty cheese slices',
  yogurt: 'natural yogurt',
  butter: 'salted butter',
  margarine: 'margarine spread',

  // bakery
  bread: 'white sandwich bread loaf',
  'white bread': 'white sandwich bread loaf',
  'wholemeal bread': 'wholemeal bread loaf',
  'multigrain bread': 'multigrain bread loaf',
  sourdough: 'sourdough bread loaf',

  // eggs
  eggs: 'free range eggs',
  egg: 'free range eggs',

  // pantry
  sugar: 'white sugar',
  flour: 'plain flour',
  rice: 'long grain white rice',
  pasta: 'spaghetti pasta',
  macaroni: 'macaroni pasta',
  lentils: 'lentils can',
  chickpeas: 'chickpeas can',
  'black beans': 'black beans can',
  'cannellini beans': 'cannellini beans can',
  tuna: 'tuna in springwater',
  'olive oil': 'olive oil extra virgin',
  'tomato sauce': 'tomato sauce bottle',
  'peanut butter': 'peanut butter smooth',
  jam: 'strawberry jam',
  coffee: 'coffee instant',
  tea: 'english breakfast tea bags',
  'tea bags': 'english breakfast tea bags',
  oats: 'rolled oats',

  // produce
  bananas: 'bananas cavendish',
  banana: 'bananas cavendish',
  apples: 'apples pink lady',
  oranges: 'oranges navel',
  grapes: 'grapes red',
  strawberries: 'strawberries punnet',
  blueberries: 'blueberries punnet',
  potatoes: 'potatoes washed',
  potato: 'potatoes washed',
  onions: 'brown onions',
  onion: 'brown onions',
  tomatoes: 'tomatoes truss',
  capsicum: 'capsicum red',
  lettuce: 'lettuce iceberg',
  spinach: 'baby spinach',

  // meat
  bacon: 'bacon rashers',
  ham: 'sliced ham',
  salmon: 'salmon fillets',
  steak: 'beef steak rump',
  'chicken breast': 'chicken breast fillets',
  'chicken breasts': 'chicken breast fillets',
  'chicken thigh': 'chicken thigh fillets',
  'chicken thighs': 'chicken thigh fillets',

  // frozen
  peas: 'frozen peas',
  'ice cream': 'vanilla ice cream',

  // snacks
  shapes: 'shapes bbq',
};
