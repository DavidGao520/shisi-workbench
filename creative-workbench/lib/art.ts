import tomatoEgg from '../public/art/tomato_egg.webp?inline';
import greenPepperEgg from '../public/art/green_pepper_egg.webp?inline';
import tomato from '../public/art/tomato.webp?inline';

import vegetableCardFrame from '../public/art/cards/card_frame_veg.webp?inline';
import meatCardFrame from '../public/art/cards/card_frame_meat.webp?inline';
import spiceCardFrame from '../public/art/cards/card_frame_spice.webp?inline';
import cardTomato from '../public/art/cards/tomato.webp?inline';
import cardEgg from '../public/art/cards/egg.webp?inline';
import cardPotato from '../public/art/cards/potato.webp?inline';
import cardPork from '../public/art/cards/pork.webp?inline';
import cardRice from '../public/art/cards/rice.webp?inline';
import cardTofu from '../public/art/cards/tofu.webp?inline';
import cardGreenPepper from '../public/art/cards/green_pepper.webp?inline';
import cardOnion from '../public/art/cards/onion.webp?inline';
import cardShiitakeMushrooms from '../public/art/cards/shiitake_mushrooms.webp?inline';
import cardLambLettuce from '../public/art/cards/lamb_lettuce.webp?inline';
import cardCarrot from '../public/art/cards/carrot.webp?inline';
import cardChineseCabbage from '../public/art/cards/chinese_cabbage.webp?inline';
import cardEggplant from '../public/art/cards/eggplant.webp?inline';
import cardGreenBeans from '../public/art/cards/green_beans.webp?inline';
import cardSoyBeans from '../public/art/cards/soy_beans.webp?inline';
import cardFlour from '../public/art/cards/flour.webp?inline';
import cardNoodle from '../public/art/cards/noodle.webp?inline';
import cardLemon from '../public/art/cards/lemon.webp?inline';
import cardMilk from '../public/art/cards/milk.webp?inline';
import cardChickenDrum from '../public/art/cards/chicken_drum.webp?inline';
import { pantryArtId } from './pantry-art';
import cardPorkRibs from '../public/art/cards/pork_ribs.webp?inline';
import cardSteak from '../public/art/cards/steak.webp?inline';
import cardFish from '../public/art/cards/fish.webp?inline';
import cardShrimp from '../public/art/cards/shrimp.webp?inline';
import cardPorkBelly from '../public/art/cards/pork_belly.webp?inline';
import cardWholeChicken from '../public/art/cards/whole_chicken.webp?inline';
import cardCrayfish from '../public/art/cards/crayfish.webp?inline';
import cardWoodEar from '../public/art/cards/wood_ear.webp?inline';
import cardCucumber from '../public/art/cards/cucumber.webp?inline';
import cardPineapple from '../public/art/cards/pineapple.webp?inline';
import cardScallion from '../public/art/cards/scallion.webp?inline';
import cardTeaLeaves from '../public/art/cards/tea_leaves.webp?inline';
import cardClam from '../public/art/cards/clam.webp?inline';
import cardSeaCucumber from '../public/art/cards/sea_cucumber.webp?inline';
import cardPorkIntestine from '../public/art/cards/pork_intestine.webp?inline';
import cardPigTrotter from '../public/art/cards/pig_trotter.webp?inline';
import cardGoose from '../public/art/cards/goose.webp?inline';
import cardCrab from '../public/art/cards/crab.webp?inline';
import cardSquid from '../public/art/cards/squid.webp?inline';
import cardOyster from '../public/art/cards/oyster.webp?inline';
import cardScallop from '../public/art/cards/scallop.webp?inline';
import cardLamb from '../public/art/cards/lamb.webp?inline';
import cardLotusRoot from '../public/art/cards/lotus_root.webp?inline';
import cardMatsutake from '../public/art/cards/matsutake.webp?inline';
import cardPickledCabbage from '../public/art/cards/pickled_cabbage.webp?inline';
import cardCoconut from '../public/art/cards/coconut.webp?inline';
import cardCuredSausage from '../public/art/cards/cured_sausage.webp?inline';
import cardSalt from '../public/art/cards/salt.webp?inline';
import cardChili from '../public/art/cards/chili.webp?inline';
import cardVinegar from '../public/art/cards/vinegar.webp?inline';
import cardSugar from '../public/art/cards/sugar.webp?inline';
import cardBayLeaf from '../public/art/cards/bay_leaf.webp?inline';
import cardChiliOil from '../public/art/cards/chili_oil.webp?inline';
import cardCumin from '../public/art/cards/cumin.webp?inline';
import cardDarkSoySauce from '../public/art/cards/dark_soy_sauce.webp?inline';
import cardDoubanjiang from '../public/art/cards/doubanjiang.webp?inline';
import cardGarlic from '../public/art/cards/garlic.webp?inline';
import cardGinger from '../public/art/cards/ginger.webp?inline';
import cardSpringOnion from '../public/art/cards/spring_onion.webp?inline';
import cardSichuanPepper from '../public/art/cards/sichuan_pepper.webp?inline';
import cardSoySauce from '../public/art/cards/soy_sauce.webp?inline';
import cardStarAnise from '../public/art/cards/star_anise.webp?inline';
import cardCilantro from '../public/art/cards/cilantro.webp?inline';
import cardOil from '../public/art/cards/oil.webp?inline';
import cardCookingWine from '../public/art/cards/cooking_wine.webp?inline';
import cardStarch from '../public/art/cards/starch.webp?inline';
import cardCookedRice from '../public/art/cards/cooked_rice.webp?inline';
import cardWhitePepper from '../public/art/cards/white_pepper.webp?inline';
import cardDriedChili from '../public/art/cards/dried_chili.webp?inline';
import cardSesameOil from '../public/art/cards/sesame_oil.webp?inline';
import cardWater from '../public/art/cards/water.webp?inline';
import {
  baiweiPantry,
  type PantryCardFrame,
  type PantryCardKind,
} from './pantry-catalog';

export const art: Record<string, string> = {
  tomato_egg: tomatoEgg,
  green_pepper_egg: greenPepperEgg,
  tomato,
};

const cardFrames: Record<PantryCardFrame, string> = {
  vegetable: vegetableCardFrame,
  meat: meatCardFrame,
  spice: spiceCardFrame,
};

const cardImages: Record<string, string> = {
  tomato: cardTomato,
  egg: cardEgg,
  potato: cardPotato,
  pork: cardPork,
  rice: cardRice,
  tofu: cardTofu,
  green_pepper: cardGreenPepper,
  onion: cardOnion,
  shiitake_mushrooms: cardShiitakeMushrooms,
  lamb_lettuce: cardLambLettuce,
  carrot: cardCarrot,
  chinese_cabbage: cardChineseCabbage,
  eggplant: cardEggplant,
  green_beans: cardGreenBeans,
  soy_beans: cardSoyBeans,
  flour: cardFlour,
  noodle: cardNoodle,
  lemon: cardLemon,
  milk: cardMilk,
  chicken_drum: cardChickenDrum,
  pork_ribs: cardPorkRibs,
  steak: cardSteak,
  fish: cardFish,
  shrimp: cardShrimp,
  pork_belly: cardPorkBelly,
  whole_chicken: cardWholeChicken,
  crayfish: cardCrayfish,
  wood_ear: cardWoodEar,
  cucumber: cardCucumber,
  pineapple: cardPineapple,
  scallion: cardScallion,
  tea_leaves: cardTeaLeaves,
  clam: cardClam,
  sea_cucumber: cardSeaCucumber,
  pork_intestine: cardPorkIntestine,
  pig_trotter: cardPigTrotter,
  goose: cardGoose,
  crab: cardCrab,
  squid: cardSquid,
  oyster: cardOyster,
  scallop: cardScallop,
  lamb: cardLamb,
  lotus_root: cardLotusRoot,
  matsutake: cardMatsutake,
  pickled_cabbage: cardPickledCabbage,
  coconut: cardCoconut,
  cured_sausage: cardCuredSausage,
  salt: cardSalt,
  chili: cardChili,
  vinegar: cardVinegar,
  sugar: cardSugar,
  bay_leaf: cardBayLeaf,
  chili_oil: cardChiliOil,
  cumin: cardCumin,
  dark_soy_sauce: cardDarkSoySauce,
  doubanjiang: cardDoubanjiang,
  garlic: cardGarlic,
  ginger: cardGinger,
  spring_onion: cardSpringOnion,
  sichuan_pepper: cardSichuanPepper,
  soy_sauce: cardSoySauce,
  star_anise: cardStarAnise,
  cilantro: cardCilantro,
};

export type PantryCardArt = {
  frame: string;
  image: string;
  kind: PantryCardKind;
  theme: PantryCardFrame;
};

const baiweiPantryCardArt: Record<string, PantryCardArt> = Object.fromEntries(
  baiweiPantry.map((item) => [
    item.id,
    {
      frame: cardFrames[item.frame],
      image: cardImages[item.id],
      kind: item.kind,
      theme: item.frame,
    },
  ]),
);

const workbenchSupplementalCardArt: Record<string, PantryCardArt> = {
  oil: {
    frame: spiceCardFrame,
    image: cardOil,
    kind: 'seasoning',
    theme: 'spice',
  },
  cooking_wine: {
    frame: spiceCardFrame,
    image: cardCookingWine,
    kind: 'seasoning',
    theme: 'spice',
  },
  starch: {
    frame: spiceCardFrame,
    image: cardStarch,
    kind: 'seasoning',
    theme: 'spice',
  },
  cooked_rice: {
    frame: vegetableCardFrame,
    image: cardCookedRice,
    kind: 'ingredient',
    theme: 'vegetable',
  },
  white_pepper: {
    frame: spiceCardFrame,
    image: cardWhitePepper,
    kind: 'seasoning',
    theme: 'spice',
  },
  dried_chili: {
    frame: spiceCardFrame,
    image: cardDriedChili,
    kind: 'seasoning',
    theme: 'spice',
  },
  sesame_oil: {
    frame: spiceCardFrame,
    image: cardSesameOil,
    kind: 'seasoning',
    theme: 'spice',
  },
  water: {
    frame: vegetableCardFrame,
    image: cardWater,
    kind: 'ingredient',
    theme: 'vegetable',
  },
};

export const pantryCardArt: Record<string, PantryCardArt> = {
  ...baiweiPantryCardArt,
  ...workbenchSupplementalCardArt,
};

export function getPantryCardArt(ingredientId: string, displayName: string) {
  return pantryCardArt[pantryArtId(ingredientId, displayName)];
}
