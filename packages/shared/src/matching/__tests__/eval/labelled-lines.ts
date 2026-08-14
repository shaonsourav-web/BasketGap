/**
 * Labelled evaluation set for the matching engine (Round 8.5 Part B).
 *
 * Pure data — add lines here without touching the runner.
 *
 * `expected` is the **canonical product name** exactly as it appears in
 * `matching/seed/canonical-seed.ts`, or `null` when the line has no correct
 * answer in the catalogue and the engine should land `needs_attention`.
 * Size variants share a name (three "Full Cream Milk" rows), so the label is a
 * product-identity label, not a pack-size label.
 *
 * `tags` are descriptive only; the runner groups mismatches by them.
 */

export type LabelTag =
  | 'staple'
  | 'brand'
  | 'typo'
  | 'shorthand'
  | 'slang'
  | 'size'
  | 'multipack'
  | 'vague'
  | 'out-of-catalogue';

export interface LabelledLine {
  line: string;
  expected: string | null;
  tags?: LabelTag[];
}

export const LABELLED_LINES: LabelledLine[] = [
  // ---------------------------------------------------------------- dairy
  { line: 'full cream milk 2L', expected: 'Full Cream Milk', tags: ['staple', 'size'] },
  { line: 'full cream 1L', expected: 'Full Cream Milk', tags: ['shorthand', 'size'] },
  { line: 'fc milk', expected: 'Full Cream Milk', tags: ['shorthand'] },
  { line: 'milk 1L', expected: 'Full Cream Milk', tags: ['vague', 'size'] },
  { line: 'mlk 2l', expected: 'Full Cream Milk', tags: ['typo', 'size'] },
  { line: 'skim milk', expected: 'Skim Milk', tags: ['staple'] },
  { line: 'skim 2L', expected: 'Skim Milk', tags: ['shorthand', 'size'] },
  { line: 'lite milk 2l', expected: 'Light Milk', tags: ['shorthand', 'size'] },
  { line: 'long life milk', expected: 'UHT Long Life Milk', tags: ['shorthand'] },
  { line: 'lactose free milk 1l', expected: 'Lactose Free Milk', tags: ['staple', 'size'] },
  { line: 'almond milk unsweetened', expected: 'Almond Milk Unsweetened', tags: ['staple'] },
  { line: 'oat milk 1L', expected: 'Oat Milk', tags: ['staple', 'size'] },
  { line: 'soy milk', expected: 'Soy Milk', tags: ['staple'] },
  { line: 'greek style yogurt 1kg', expected: 'Greek Style Yogurt', tags: ['staple', 'size'] },
  { line: 'greek yoghurt', expected: 'Greek Style Yogurt', tags: ['typo'] },
  { line: 'natural yogurt 1kg', expected: 'Natural Yogurt', tags: ['staple', 'size'] },
  { line: 'vanilla yogert', expected: 'Vanilla Yogurt', tags: ['typo'] },
  { line: 'tasty cheese block 500g', expected: 'Tasty Cheese Block', tags: ['staple', 'size'] },
  { line: 'bega tasty 500g', expected: 'Tasty Cheese Block', tags: ['brand', 'size'] },
  { line: 'chese slices', expected: 'Tasty Cheese Slices', tags: ['typo'] },
  { line: 'mozzarella cheese 250g', expected: 'Mozzarella Cheese', tags: ['staple', 'size'] },
  { line: 'parmesan chesse', expected: 'Parmesan Cheese', tags: ['typo'] },
  { line: 'feta cheese 200g', expected: 'Feta Cheese', tags: ['staple', 'size'] },
  { line: 'cream cheese 250 g', expected: 'Cream Cheese', tags: ['staple', 'size'] },
  { line: 'salted butter 250g', expected: 'Salted Butter', tags: ['staple', 'size'] },
  { line: 'unsalted buttr', expected: 'Unsalted Butter', tags: ['typo'] },
  { line: 'marg 500g', expected: 'Margarine Spread', tags: ['slang', 'size'] },
  { line: 'sour cream 300g', expected: 'Sour Cream', tags: ['staple', 'size'] },
  { line: 'thickened cream 300ml', expected: 'Thickened Cream', tags: ['staple', 'size'] },
  { line: 'pure cream', expected: 'Pure Cream', tags: ['staple'] },

  // --------------------------------------------------------------- bakery
  {
    line: 'white sandwich bread loaf 700g',
    expected: 'White Sandwich Bread Loaf',
    tags: ['staple', 'size'],
  },
  { line: 'bred', expected: 'White Sandwich Bread Loaf', tags: ['typo', 'vague'] },
  { line: 'wholemeal bread loaf', expected: 'Wholemeal Bread Loaf', tags: ['staple'] },
  { line: 'multigrain bread', expected: 'Multigrain Bread Loaf', tags: ['staple'] },
  { line: 'sourdough loaf', expected: 'Sourdough Bread Loaf', tags: ['staple'] },
  { line: 'turkish bread 400g', expected: 'Turkish Bread', tags: ['staple', 'size'] },
  { line: 'pita bread', expected: 'Pita Bread', tags: ['staple'] },
  { line: 'english muffins 6pk', expected: 'English Muffins', tags: ['multipack'] },
  { line: 'crumpets 6 pack', expected: 'Crumpets', tags: ['multipack'] },
  { line: 'wraps x8', expected: 'Wraps', tags: ['multipack'] },
  { line: 'dinner rolls', expected: 'Dinner Rolls', tags: ['staple'] },

  // ----------------------------------------------------------------- eggs
  { line: 'free range eggs 12', expected: 'Free Range Eggs', tags: ['staple'] },
  { line: 'eggs dozen', expected: 'Free Range Eggs', tags: ['vague', 'multipack'] },
  { line: 'cage free eggs 12pk', expected: 'Cage Free Eggs', tags: ['multipack'] },
  { line: 'organic eggs', expected: 'Organic Eggs', tags: ['staple'] },

  // --------------------------------------------------------------- pantry
  { line: 'white sugar 1kg', expected: 'White Sugar', tags: ['staple', 'size'] },
  { line: 'brown sugar 500g', expected: 'Brown Sugar', tags: ['staple', 'size'] },
  { line: 'plain flour 1kg', expected: 'Plain Flour', tags: ['staple', 'size'] },
  { line: 'self raising flour', expected: 'Self Raising Flour', tags: ['staple'] },
  { line: 'wholemeal flour 1 kg', expected: 'Wholemeal Flour', tags: ['staple', 'size'] },
  {
    line: 'long grain white rice 1kg',
    expected: 'Long Grain White Rice',
    tags: ['staple', 'size'],
  },
  { line: 'jasmine rice', expected: 'Jasmine Rice', tags: ['staple'] },
  { line: 'basmati rice 1kg', expected: 'Basmati Rice', tags: ['staple', 'size'] },
  { line: 'brown rice', expected: 'Brown Rice', tags: ['staple'] },
  { line: 'spag 500g', expected: 'Spaghetti Pasta', tags: ['slang', 'size'] },
  { line: 'spagetti pasta', expected: 'Spaghetti Pasta', tags: ['typo'] },
  { line: 'penne pasta 500g', expected: 'Penne Pasta', tags: ['staple', 'size'] },
  { line: 'lasagne sheets', expected: 'Lasagna Sheets', tags: ['typo'] },
  { line: 'macaroni', expected: 'Macaroni Pasta', tags: ['staple'] },
  { line: 'passata', expected: 'Tomato Passata', tags: ['shorthand'] },
  { line: 'pasta sauce 500g', expected: 'Pasta Sauce', tags: ['staple', 'size'] },
  { line: 'tomato paste 140g', expected: 'Tomato Paste', tags: ['staple', 'size'] },
  { line: 'diced tomatoes can 400g', expected: 'Diced Tomatoes Can', tags: ['staple', 'size'] },
  { line: 'tinned tommatoes', expected: 'Diced Tomatoes Can', tags: ['typo', 'slang'] },
  { line: 'tuna in springwater 95g', expected: 'Tuna in Springwater', tags: ['staple', 'size'] },
  { line: 'tuna in oil', expected: 'Tuna in Oil', tags: ['staple'] },
  { line: 'baked beans can', expected: 'Baked Beans Can', tags: ['staple'] },
  { line: 'chickpeas can 400g', expected: 'Chickpeas Can', tags: ['staple', 'size'] },
  { line: 'cannellini beans', expected: 'Cannellini Beans Can', tags: ['staple'] },
  { line: 'black beans can', expected: 'Black Beans Can', tags: ['staple'] },
  { line: 'lentils', expected: 'Lentils Can', tags: ['staple'] },
  {
    line: 'olive oil extra virgin 1L',
    expected: 'Olive Oil Extra Virgin',
    tags: ['staple', 'size'],
  },
  { line: 'evoo', expected: 'Olive Oil Extra Virgin', tags: ['slang'] },
  { line: 'vegetable oil 1l', expected: 'Vegetable Oil', tags: ['staple', 'size'] },
  { line: 'canola oil', expected: 'Canola Oil', tags: ['staple'] },
  { line: 'white vinegar 750ml', expected: 'White Vinegar', tags: ['staple', 'size'] },
  { line: 'balsamic vinegar', expected: 'Balsamic Vinegar', tags: ['staple'] },
  { line: 'tomato sauce bottle 500ml', expected: 'Tomato Sauce Bottle', tags: ['staple', 'size'] },
  { line: 'bbq sauce', expected: 'BBQ Sauce', tags: ['staple'] },
  { line: 'mayonnaise 440g', expected: 'Mayonnaise', tags: ['staple', 'size'] },
  { line: 'soy sauce 500ml', expected: 'Soy Sauce', tags: ['staple', 'size'] },
  { line: 'honey 500g', expected: 'Honey', tags: ['staple', 'size'] },
  { line: 'peanut butter smooth 375g', expected: 'Peanut Butter Smooth', tags: ['staple', 'size'] },
  { line: 'crunchy peanut butter', expected: 'Peanut Butter Crunchy', tags: ['staple'] },
  { line: 'strawberry jam 500g', expected: 'Strawberry Jam', tags: ['staple', 'size'] },
  { line: 'vegemite', expected: 'Vegemite Spread', tags: ['brand', 'shorthand'] },
  { line: 'nutella 400g', expected: 'Nutella', tags: ['brand', 'size'] },
  { line: 'cofee instant', expected: 'Coffee Instant', tags: ['typo'] },
  { line: 'coffee ground 250g', expected: 'Coffee Ground', tags: ['staple', 'size'] },
  { line: 'english breakfast tea bags', expected: 'English Breakfast Tea Bags', tags: ['staple'] },
  { line: 'cuppa', expected: 'English Breakfast Tea Bags', tags: ['slang'] },
  { line: 'porridge', expected: 'Rolled Oats', tags: ['slang'] },
  { line: 'weetbix 1.2kg', expected: 'Weet-Bix Cereal', tags: ['brand', 'slang', 'size'] },
  { line: 'cornflakes cereal 725g', expected: 'Cornflakes Cereal', tags: ['staple', 'size'] },
  { line: 'muesli 750g', expected: 'Muesli', tags: ['staple', 'size'] },

  // -------------------------------------------------------------- produce
  { line: 'bananas cavendish 1kg', expected: 'Bananas Cavendish', tags: ['staple', 'size'] },
  { line: 'bannanas', expected: 'Bananas Cavendish', tags: ['typo'] },
  { line: 'apples pink lady 1kg', expected: 'Apples Pink Lady', tags: ['staple', 'size'] },
  { line: 'granny smith apples', expected: 'Apples Granny Smith', tags: ['staple'] },
  { line: 'oranges navel', expected: 'Oranges Navel', tags: ['staple'] },
  { line: 'lemons 1kg', expected: 'Lemons', tags: ['staple', 'size'] },
  { line: 'strawberries punnet 250g', expected: 'Strawberries Punnet', tags: ['staple', 'size'] },
  { line: 'blueberries punnet', expected: 'Blueberries Punnet', tags: ['staple'] },
  { line: 'red grapes', expected: 'Grapes Red', tags: ['staple'] },
  { line: 'avo', expected: 'Avocado', tags: ['slang'] },
  { line: 'spuds 2kg', expected: 'Potatoes Washed', tags: ['slang', 'size'] },
  { line: 'sweet potato 1kg', expected: 'Sweet Potato', tags: ['staple', 'size'] },
  { line: 'brown onions 1kg', expected: 'Brown Onions', tags: ['staple', 'size'] },
  { line: 'red onoins', expected: 'Red Onions', tags: ['typo'] },
  { line: 'garlic', expected: 'Garlic', tags: ['staple'] },
  { line: 'carots 1kg', expected: 'Carrots', tags: ['typo', 'size'] },
  { line: 'brocoli', expected: 'Broccoli', tags: ['typo'] },
  { line: 'caulflower', expected: 'Cauliflower', tags: ['typo'] },
  { line: 'tomatoes truss 1kg', expected: 'Tomatoes Truss', tags: ['staple', 'size'] },
  { line: 'cherry tomatoes 250g', expected: 'Cherry Tomatoes', tags: ['staple', 'size'] },
  { line: 'cucumber', expected: 'Cucumber', tags: ['staple'] },
  { line: 'capsicum red', expected: 'Capsicum Red', tags: ['staple'] },
  { line: 'iceberg lettuce', expected: 'Lettuce Iceberg', tags: ['staple'] },
  { line: 'baby spinach 120g', expected: 'Baby Spinach', tags: ['staple', 'size'] },
  { line: 'rocket', expected: 'Rocket Lettuce', tags: ['slang'] },
  { line: 'mushrooms 500g', expected: 'Mushrooms', tags: ['staple', 'size'] },
  { line: 'zuchini 1kg', expected: 'Zucchini', tags: ['typo', 'size'] },
  { line: 'veggies', expected: null, tags: ['vague', 'slang'] },

  // ----------------------------------------------------------------- meat
  { line: 'beef mince 500g', expected: 'Beef Mince', tags: ['staple', 'size'] },
  { line: 'mince 500g', expected: 'Beef Mince', tags: ['slang', 'size'] },
  { line: 'lean beef mince', expected: 'Beef Mince Lean', tags: ['staple'] },
  {
    line: 'chicken breast fillets 1kg',
    expected: 'Chicken Breast Fillets',
    tags: ['staple', 'size'],
  },
  { line: 'chook breast', expected: 'Chicken Breast Fillets', tags: ['slang'] },
  { line: 'chicken thigh fillets', expected: 'Chicken Thigh Fillets', tags: ['staple'] },
  { line: 'chicken drumsticks 1kg', expected: 'Chicken Drumsticks', tags: ['staple', 'size'] },
  { line: 'whole roast chicken', expected: 'Whole Roast Chicken', tags: ['staple'] },
  { line: 'pork snags 500g', expected: 'Pork Sausages', tags: ['slang', 'size'] },
  { line: 'beef snags', expected: 'Beef Sausages', tags: ['slang'] },
  { line: 'rashers 250g', expected: 'Bacon Rashers', tags: ['slang', 'size'] },
  { line: 'sliced ham 200g', expected: 'Sliced Ham', tags: ['staple', 'size'] },
  { line: 'salmon fillets 500g', expected: 'Salmon Fillets', tags: ['staple', 'size'] },
  { line: 'lamb chops 1kg', expected: 'Lamb Chops', tags: ['staple', 'size'] },
  { line: 'pork chops', expected: 'Pork Chops', tags: ['staple'] },
  { line: 'rump', expected: 'Beef Steak Rump', tags: ['slang'] },

  // --------------------------------------------------------------- frozen
  { line: 'frozen peas 500g', expected: 'Frozen Peas', tags: ['staple', 'size'] },
  { line: 'frozen mixed vegetables', expected: 'Frozen Mixed Vegetables', tags: ['staple'] },
  { line: 'frozen chips 1kg', expected: 'Frozen Chips', tags: ['staple', 'size'] },
  { line: 'frozen berries mixed 500g', expected: 'Frozen Berries Mixed', tags: ['staple', 'size'] },
  { line: 'vanilla ice cream 2L', expected: 'Vanilla Ice Cream', tags: ['staple', 'size'] },
  { line: 'chocolat ice cream', expected: 'Chocolate Ice Cream', tags: ['typo'] },
  { line: 'frozen pizza margherita', expected: 'Frozen Pizza Margherita', tags: ['staple'] },
  { line: 'fish fingers 425g', expected: 'Fish Fingers', tags: ['staple', 'size'] },

  // --------------------------------------------------------------- snacks
  { line: 'potato chips salted 175g', expected: 'Potato Chips Salted', tags: ['staple', 'size'] },
  { line: 'tim tams', expected: 'Tim Tams Chocolate Biscuits', tags: ['brand', 'slang'] },
  { line: 'arnotts scotch fingers', expected: 'Scotch Finger Biscuits', tags: ['brand', 'slang'] },
  { line: 'shapes bbq 175g', expected: 'Shapes BBQ', tags: ['brand', 'size'] },
  { line: 'salt and vinegar chips', expected: 'Salt and Vinegar Chips', tags: ['staple'] },
  { line: 'bickies', expected: null, tags: ['vague', 'slang'] },

  // --------------------------------------------------------------- drinks
  { line: 'coca cola 2l', expected: 'Coca Cola', tags: ['brand', 'size'] },
  { line: 'coke 2L', expected: 'Coca Cola', tags: ['slang', 'size'] },
  { line: 'sparkling water 1.25l', expected: 'Sparkling Water', tags: ['staple', 'size'] },
  { line: 'orange juice 2L', expected: 'Orange Juice', tags: ['staple', 'size'] },
  { line: 'apple juice', expected: 'Apple Juice', tags: ['staple'] },
  { line: 'cordy raspberry', expected: 'Cordial Raspberry', tags: ['slang'] },
  { line: 'fizzy drink', expected: null, tags: ['vague', 'slang'] },

  // ------------------------------------------------------------ household
  { line: 'toilet paper 12pk', expected: 'Toilet Paper', tags: ['staple', 'multipack'] },
  { line: 'loo paper', expected: 'Toilet Paper', tags: ['slang'] },
  { line: 'dunny roll 12 pack', expected: 'Toilet Paper', tags: ['slang', 'multipack'] },
  { line: 'paper towel', expected: 'Paper Towel', tags: ['staple'] },
  { line: 'dishwashing liquid 500ml', expected: 'Dishwashing Liquid', tags: ['staple', 'size'] },
  { line: 'dishies', expected: 'Dishwashing Liquid', tags: ['slang'] },
  {
    line: 'laundry detergent liquid 2l',
    expected: 'Laundry Detergent Liquid',
    tags: ['staple', 'size'],
  },
  { line: 'laundry powder 2kg', expected: 'Laundry Detergent Powder', tags: ['staple', 'size'] },
  { line: 'dishwasher tablets 30pk', expected: 'Dishwasher Tablets', tags: ['multipack'] },
  { line: 'glad wrap', expected: 'Cling Wrap', tags: ['slang'] },
  { line: 'alfoil', expected: 'Aluminium Foil', tags: ['slang'] },
  { line: 'bin liners kitchen 50pk', expected: 'Bin Liners Kitchen', tags: ['multipack'] },

  // ----------------------------------------------- deliberately unmatched
  { line: 'kombucha 500ml', expected: null, tags: ['out-of-catalogue'] },
  { line: 'cat food 12 pack', expected: null, tags: ['out-of-catalogue', 'multipack'] },
  { line: 'nappies size 4', expected: null, tags: ['out-of-catalogue'] },
  { line: 'toothpaste', expected: null, tags: ['out-of-catalogue'] },
  { line: 'shampoo 400ml', expected: null, tags: ['out-of-catalogue'] },
  { line: 'batteries aa 4pk', expected: null, tags: ['out-of-catalogue', 'multipack'] },
  { line: 'birthday candles', expected: null, tags: ['out-of-catalogue'] },
  { line: 'dog treats', expected: null, tags: ['out-of-catalogue'] },
  { line: 'sunscreen spf 50', expected: null, tags: ['out-of-catalogue'] },
  { line: 'protein powder 1kg', expected: null, tags: ['out-of-catalogue'] },
  { line: 'hummus dip 200g', expected: null, tags: ['out-of-catalogue'] },
  { line: 'sushi seaweed sheets', expected: null, tags: ['out-of-catalogue'] },
  { line: 'quinoa 500g', expected: null, tags: ['out-of-catalogue'] },
  { line: 'snacks', expected: null, tags: ['vague'] },
  { line: 'stuff for dinner', expected: null, tags: ['vague'] },
  { line: 'xyzzy asdf', expected: null, tags: ['out-of-catalogue'] },

  // ------------------------------------- Round 8.5 hardening: new coverage
  // Added 2026-08-14 alongside the grown shorthand dictionary and the fuzzy
  // spell corrector. Lines 1–9 document coverage the deterministic path gained;
  // `icecream 2l` and `bbq snags 500g` are known remaining false negatives kept
  // in the set on purpose so the harness still has something to fail on; the
  // final line proves ungrounded slang is deferred rather than invented.
  { line: 'washing powder 2kg', expected: 'Laundry Detergent Powder', tags: ['slang', 'size'] },
  { line: 'oj 2l', expected: 'Orange Juice', tags: ['shorthand', 'size'] },
  { line: 'dozen eggs', expected: 'Free Range Eggs', tags: ['shorthand', 'multipack'] },
  { line: 'tinned tuna', expected: 'Tuna in Springwater', tags: ['shorthand'] },
  { line: 'mushies 500g', expected: 'Mushrooms', tags: ['slang', 'size'] },
  { line: 'cucmber', expected: 'Cucumber', tags: ['typo'] },
  { line: 'strawbs', expected: 'Strawberries Punnet', tags: ['slang'] },
  { line: 'spinnach 120g', expected: 'Baby Spinach', tags: ['typo', 'size'] },
  { line: 'almond milk', expected: 'Almond Milk Unsweetened', tags: ['vague'] },
  { line: 'icecream 2l', expected: 'Vanilla Ice Cream', tags: ['typo', 'vague'] },
  { line: 'bbq snags 500g', expected: 'Beef Sausages', tags: ['slang', 'size'] },
  { line: 'sav blanc', expected: null, tags: ['out-of-catalogue', 'slang'] },
];
