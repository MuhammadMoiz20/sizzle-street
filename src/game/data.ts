import type { Recipe, SpiceDef, Helper } from './types';

// All content below is original. Town: Brambleford. Restaurant 1: The Copper Skillet.
export const RESTAURANT = {
  id: 'copper_skillet',
  name: 'The Copper Skillet',
  town: 'Brambleford',
  tagline: 'Honest comfort food on Sizzle Street',
  seats: 4,
  shiftLength: 180, // seconds
};

export const CRITIC = { name: 'Marguerite Pell', title: 'The Brambleford Ledger' };
export const RIVAL = { name: 'Corvin Lasche', restaurant: 'Maison Lasche' };

export const CUSTOMER_NAMES = [
  'Ada Fenwick', 'Bram Oakes', 'Cleo Marsh', 'Dev Anand', 'Effie Sloane', 'Finn Harrow',
  'Greta Voss', 'Hal Pruitt', 'Ines Calder', 'Jory Blackwood', 'Kit Lowell', 'Lena Farrow',
];

export const RECIPES: Recipe[] = [
  {
    id: 'skillet_burger', name: 'Skillet Burger', unlockCost: 0, price: 12,
    description: 'Seared patty, sliced onion and tomato, house seasoning.',
    steps: [
      { kind: 'chop', ingredient: 'onion' },
      { kind: 'grill', ingredient: 'beef_patty', cookTime: 9 },
      { kind: 'season', ingredient: 'beef_patty', targetAmount: 4 },
    ],
  },
  {
    id: 'golden_fries', name: 'Golden Fries', unlockCost: 0, price: 6,
    description: 'Hand-cut potato, fried until golden.',
    steps: [
      { kind: 'chop', ingredient: 'potato' },
      { kind: 'fry', ingredient: 'fries_cut', cookTime: 12 },
    ],
  },
  {
    id: 'garden_toss', name: 'Garden Toss Salad', unlockCost: 0, price: 8,
    description: 'Crisp lettuce and tomato tossed in a bright dressing.',
    steps: [
      { kind: 'chop', ingredient: 'lettuce' },
      { kind: 'stir', ingredient: 'dressing' },
      { kind: 'season', ingredient: 'dressing', targetAmount: 3 },
    ],
  },
  {
    id: 'crispy_rings', name: 'Crispy Onion Rings', unlockCost: 40,
    price: 7, description: 'Thick onion rings in a crackly batter.',
    steps: [
      { kind: 'chop', ingredient: 'onion' },
      { kind: 'fry', ingredient: 'onion_ring_batter', cookTime: 10 },
      { kind: 'season', ingredient: 'onion_ring_batter', targetAmount: 3 },
    ],
  },
  {
    id: 'hearth_soup', name: 'Hearth Tomato Soup', unlockCost: 60, price: 9,
    description: 'Slow-stirred tomato and carrot soup.',
    steps: [
      { kind: 'chop', ingredient: 'carrot' },
      { kind: 'stir', ingredient: 'broth' },
      { kind: 'season', ingredient: 'broth', targetAmount: 5 },
    ],
  },
  {
    id: 'seared_chicken', name: 'Seared Chicken Plate', unlockCost: 90, price: 15, signature: true,
    description: 'The Copper Skillet signature: pan-seared chicken with a glossy pan sauce.',
    steps: [
      { kind: 'grill', ingredient: 'chicken_breast', cookTime: 11 },
      { kind: 'stir', ingredient: 'pan_sauce' },
      { kind: 'season', ingredient: 'chicken_breast', targetAmount: 4 },
    ],
  },
];

export const SPICES: SpiceDef[] = [
  { id: 'smoked_salt', name: 'Smoked Salt', cost: 30, tipBonus: 1.08 },
  { id: 'ember_pepper', name: 'Ember Pepper', cost: 45, tipBonus: 1.1 },
  { id: 'garden_herbs', name: 'Garden Herb Blend', cost: 60, tipBonus: 1.12 },
];

export const HIREABLE_HELPERS: Helper[] = [
  { id: 'pip', name: 'Pip Rowan', hireCost: 50, wagePerShift: 10, speed: 0.5, accuracy: 0.6 },
  { id: 'marla', name: 'Marla Quince', hireCost: 90, wagePerShift: 16, speed: 0.65, accuracy: 0.75 },
  { id: 'ozzie', name: 'Ozzie Tran', hireCost: 140, wagePerShift: 22, speed: 0.8, accuracy: 0.85 },
];

export const EQUIPMENT_UPGRADE_COST = [0, 50, 120]; // level1 -> 2 costs 50, 2 -> 3 costs 120

export const recipeById = (id: string): Recipe => {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown recipe ${id}`);
  return r;
};
