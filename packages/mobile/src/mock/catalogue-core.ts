import type { ConfidenceBand } from '@basketgap/shared/matching/types';

/**
 * SYNTHETIC sample catalogue for the offline mock.
 *
 * Every product, brand, size and price below is invented for demonstration.
 * Nothing here is copied from, or derived from, any retailer's catalogue,
 * website or shelf. Prices are arbitrary figures chosen so that the app's
 * comparison states can be exercised.
 *
 * Each retailer price is the sample promotion price at that retailer, or
 * `null` when no special is listed there. `null` means "no price" — it is
 * never zero and must never be summed or compared as zero. The sample set
 * deliberately includes all four situations:
 *   - special listed at both retailers   (counted in the totals)
 *   - special listed at one retailer only (shown, but left out of the totals)
 *   - special listed at neither           (shown as not on special)
 *
 * Keys are what people type. Longest key wins so "oat milk" never resolves
 * to plain "milk".
 */
export interface CatalogueEntry {
  keys: string[];
  name: string;
  sizeText: string;
  /** Sample promotion price in AUD, or null when no special is listed. */
  coles: number | null;
  /** Sample promotion price in AUD, or null when no special is listed. */
  woolworths: number | null;
  band: Extract<ConfidenceBand, 'matched' | 'assumed'>;
  assumption?: string;
  /** True when at least one retailer lists a special for this product. */
  onSpecial?: boolean;
  /** Human note for demos — which side lists the special. */
  specialNote?: string;
}

type Row = [
  keys: string[],
  name: string,
  sizeText: string,
  coles: number | null,
  woolworths: number | null,
  assumption?: string,
];

function entry([keys, name, sizeText, coles, woolworths, assumption]: Row): CatalogueEntry {
  const onSpecial = coles !== null || woolworths !== null;
  const specialNote =
    coles !== null && woolworths !== null
      ? 'Special listed at both retailers'
      : coles !== null
        ? 'Special listed at Coles only'
        : woolworths !== null
          ? 'Special listed at Woolworths only'
          : 'No special listed at either retailer';

  return {
    keys,
    name,
    sizeText,
    coles,
    woolworths,
    band: assumption ? 'assumed' : 'matched',
    ...(assumption ? { assumption } : {}),
    onSpecial,
    specialNote,
  };
}

const ROWS: Row[] = [
  // —— Dairy ——
  [
    ['full cream milk', 'fullcream', 'milk'],
    'Sample Full Cream Milk',
    '2 L',
    3.1,
    3.4,
    'Assumed the 2 L bottle.',
  ],
  [['skim milk', 'skim'], 'Sample Skim Milk', '2 L', null, null, 'Assumed the 2 L bottle.'],
  [['oat milk', 'oatmilk'], 'Sample Oat Drink', '1 L', null, 2.6],
  [['almond milk'], 'Sample Almond Drink', '1 L', 2.45, null],
  [
    ['tasty cheese', 'cheese block', 'cheddar', 'cheese'],
    'Test Brand Tasty Cheese Block',
    '500 g',
    4.75,
    null,
    'Assumed the 500 g block.',
  ],
  [['salted butter', 'butter'], 'Sample Salted Butter', '250 g', 4.4, 4.9],
  [
    ['greek yoghurt', 'greek yogurt', 'yoghurt', 'yogurt', 'yog'],
    'Sample Greek Style Yoghurt',
    '1 kg',
    null,
    4.2,
    'Assumed the 1 kg tub.',
  ],
  [['cream cheese'], 'Sample Cream Cheese', '250 g', null, null],
  [['dozen eggs', 'eggs'], 'Demo Farms Free Range Eggs', '12 pack', 5.2, 4.8, 'Assumed a dozen.'],
  [['sour cream'], 'Sample Sour Cream', '300 mL', 2.35, 2.35],

  // —— Bakery ——
  [
    ['white bread', 'sliced bread', 'bread', 'loaf'],
    'Sample White Sandwich Loaf',
    '700 g',
    2.5,
    2.7,
    'Assumed a 700 g loaf.',
  ],
  [['wholemeal bread', 'multigrain bread'], 'Sample Wholemeal Loaf', '700 g', null, null],
  [['wraps', 'tortillas'], 'Test Brand Flour Wraps', '8 pack', 3.2, null],
  [['crumpets'], 'Sample Crumpets', '6 pack', null, 2.3],
  [['bagels'], 'Sample Plain Bagels', '4 pack', null, null],
  [['croissants'], 'Sample Butter Croissants', '4 pack', 4.1, 3.6],
  [['english muffins', 'muffins'], 'Sample English Muffins', '6 pack', 2.9, 3.1],

  // —— Produce ——
  [['bananas', 'banana'], 'Sample Bananas', 'per kg', 2.9, 3.2, 'Assumed loose, priced per kg.'],
  [['apples'], 'Sample Red Apples', '1 kg', null, 3.8],
  [['potatoes', 'potato'], 'Sample Washed Potatoes', '2 kg', null, null],
  [['brown onions', 'onions'], 'Sample Brown Onions', '1 kg', 2.2, null],
  [['carrots'], 'Sample Carrots', '1 kg', 1.8, 1.6],
  [['cherry tomatoes', 'tomatoes'], 'Sample Cherry Tomatoes', '250 g', 3.3, 2.9],
  [['avocados', 'avocado'], 'Sample Avocado', 'each', null, 1.6],
  [['broccoli'], 'Sample Broccoli', 'each', null, null],
  [['baby spinach', 'spinach'], 'Sample Baby Spinach', '120 g', 2.8, null],
  [['lettuce'], 'Sample Cos Lettuce', 'each', 2.1, 2.3],
  [['mandarins'], 'Sample Mandarins', '1 kg', 4.5, 4.9],
  [['strawberries'], 'Sample Strawberries', '250 g', 3.6, 3.2],
  [['cucumber'], 'Sample Cucumber', 'each', 1.4, 1.3],

  // —— Meat and seafood ——
  [
    ['chicken breast', 'chicken'],
    'Sample Chicken Breast Fillets',
    '1 kg',
    8.5,
    null,
    'Assumed a 1 kg tray.',
  ],
  [['chicken thighs'], 'Sample Chicken Thigh Fillets', '1 kg', null, 7.4],
  [['beef mince', 'mince'], 'Sample Beef Mince', '500 g', 6.2, 6.7],
  [
    ['bbq sausages', 'sausages', 'snags'],
    'Test Brand Beef Sausages',
    '8 pack',
    4.8,
    5.4,
    'Assumed an 8 pack.',
  ],
  [['bacon'], 'Sample Bacon Rashers', '250 g', 4.9, 4.3],
  [['lamb chops'], 'Sample Lamb Loin Chops', '400 g', null, null],
  [['pork steaks'], 'Sample Pork Loin Steaks', '500 g', null, null],
  [['sliced ham', 'ham'], 'Sample Sliced Leg Ham', '200 g', null, 3.9],
  [['salmon'], 'Sample Salmon Fillets', '2 pack', null, 9.5],

  // —— Pantry ——
  [['spaghetti', 'pasta'], 'Test Brand Pasta', '500 g', 1.4, 1.6],
  [['pasta sauce'], 'Sample Tomato Pasta Sauce', '500 g', 2.5, null],
  [['white rice', 'rice'], 'Sample Long Grain Rice', '1 kg', null, 2.9, 'Assumed the 1 kg bag.'],
  [
    ['corn flakes', 'cornflakes', 'cereal'],
    'Sample Corn Flakes',
    '500 g',
    null,
    null,
    'Assumed the 500 g box.',
  ],
  [['rolled oats', 'oats'], 'Sample Rolled Oats', '750 g', 2.4, 2.2],
  [['olive oil'], 'Sample Olive Oil', '500 mL', 5.5, 7.2],
  [['canned tomatoes', 'tinned tomatoes'], 'Sample Diced Tomatoes', '400 g', 0.95, 1.1],
  [['baked beans'], 'Sample Baked Beans', '420 g', null, 0.9],
  [['tuna'], 'Sample Tuna in Springwater', '4 pack', 4.6, 4.2],
  [['peanut butter'], 'Sample Peanut Butter', '375 g', null, null],
  [['jam'], 'Sample Strawberry Jam', '300 g', null, 2.4],
  [
    ['instant coffee', 'coffee'],
    'Sample Instant Coffee',
    '100 g',
    6.5,
    null,
    'Assumed a 100 g jar.',
  ],
  [['tea bags', 'tea'], 'Sample Black Tea Bags', '100 pack', null, null],
  [['sugar'], 'Sample White Sugar', '1 kg', null, null],
  [['plain flour', 'flour'], 'Sample Plain Flour', '1 kg', 1.9, 1.8],
  [['honey'], 'Sample Squeezy Honey', '350 g', null, 5.5],
  [['chicken stock', 'stock'], 'Sample Chicken Stock', '1 L', 2.2, null],
  [['instant noodles', 'noodles'], 'Sample Instant Noodles', '5 pack', null, 2.6],
  [['coconut milk'], 'Sample Coconut Milk', '400 mL', null, null],
  [['vegetable oil', 'cooking oil'], 'Sample Vegetable Oil', '1 L', 3.8, 3.4],

  // —— Frozen ——
  [['ice cream'], 'Sample Vanilla Ice Cream', '2 L', 5.5, 4.5],
  [['frozen peas', 'peas'], 'Sample Garden Peas', '1 kg', 2.8, null],
  [['pizza'], 'Sample Margherita Pizza', '400 g', 4.5, 5.2],
  [['oven chips', 'hot chips', 'frozen chips'], 'Sample Oven Chips', '1 kg', 3.2, 3.0],
  [['frozen berries', 'berries'], 'Sample Mixed Berries', '500 g', null, 5.8],
  [['fish fingers'], 'Sample Fish Fingers', '375 g', null, null],
  [['dumplings'], 'Sample Pork Dumplings', '24 pack', 6.4, null],

  // —— Drinks ——
  [['soft drink', 'cola'], 'Sample Cola Cans', '24 pack', 16.5, 17.5],
  [['sparkling water'], 'Sample Sparkling Water', '10 pack', null, 6.0],
  [['orange juice'], 'Sample Orange Juice', '2 L', 3.8, 4.2],
  [['bottled water', 'water'], 'Sample Spring Water', '24 pack', null, null],
  [['iced tea'], 'Sample Iced Tea', '1.5 L', null, null],
  [['sports drink'], 'Sample Sports Drink', '6 pack', 8.5, null],

  // —— Snacks ——
  [['potato chips', 'crisps', 'chips'], 'Sample Salted Potato Chips', '170 g', 3.0, 3.5],
  [['chocolate', 'choc block'], 'Sample Milk Chocolate Block', '180 g', null, 3.2],
  [['biscuits', 'cookies'], 'Sample Choc Chip Cookies', '300 g', 2.8, null],
  [['muesli bars'], 'Sample Muesli Bars', '6 pack', 3.1, 3.3],
  [['popcorn'], 'Sample Microwave Popcorn', '3 pack', null, null],
  [['crackers'], 'Sample Water Crackers', '200 g', null, null],
  [['lollies'], 'Sample Fruit Lollies', '180 g', null, 2.5],

  // —— Household ——
  [
    ['toilet paper', 'loo roll', 'tp'],
    'Sample Toilet Tissue',
    '24 roll',
    14.5,
    16.0,
    'Assumed a 24 roll pack.',
  ],
  [['paper towels', 'paper towel'], 'Sample Paper Towel', '2 roll', 3.4, null],
  [['laundry liquid', 'laundry'], 'Sample Laundry Liquid', '2 L', 11.0, 9.0],
  [['dishwasher tablets', 'dishwasher tabs'], 'Sample Dishwasher Tablets', '40 pack', 9.0, null],
  [['dishwashing liquid', 'dish soap'], 'Sample Dishwashing Liquid', '500 mL', null, null],
  [['garbage bags', 'bin liners'], 'Sample Garbage Bags', '50 pack', null, 3.6],
  [['sponges'], 'Sample Kitchen Sponges', '6 pack', null, null],
  [['multipurpose spray', 'cleaning spray'], 'Sample Multipurpose Spray', '500 mL', 2.9, 2.6],
  [['cling wrap'], 'Sample Cling Wrap', '30 m', null, 2.8],

  // —— Personal care ——
  [['shampoo'], 'Sample Shampoo', '400 mL', 4.5, 5.0],
  [['conditioner'], 'Sample Conditioner', '400 mL', null, null],
  [['toothpaste'], 'Sample Fluoride Toothpaste', '110 g', 2.5, null],
  [['toothbrushes', 'toothbrush'], 'Sample Soft Toothbrush', '2 pack', null, 3.0],
  [['deodorant'], 'Sample Roll-on Deodorant', '50 mL', null, null],
  [['body wash'], 'Sample Body Wash', '1 L', 5.0, 4.5],
  [['razors'], 'Sample Disposable Razors', '4 pack', null, null],
  [['hand wash', 'hand soap'], 'Sample Hand Wash', '250 mL', 1.9, 2.2],

  // —— Baby ——
  [['nappies', 'nappys', 'diapers'], 'Sample Nappies', '48 pack', null, 12.5, 'Assumed a 48 pack.'],
  [['baby wipes', 'wipes'], 'Sample Baby Wipes', '80 pack', 2.8, 3.2],

  // —— Pet ——
  [['dog food', 'dogfood'], 'Sample Dry Dog Food', '3 kg', 11.5, null, 'Assumed a 3 kg bag.'],
  [['cat food'], 'Sample Wet Cat Food', '12 pack', null, 8.0],
  [['cat litter'], 'Sample Cat Litter', '10 L', null, null],
  [['dog treats'], 'Sample Dog Treats', '500 g', 4.2, 4.5],
];

export const CORE_CATALOGUE: CatalogueEntry[] = ROWS.map(entry);
