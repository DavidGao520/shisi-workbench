import tomatoEgg from '../public/art/tomato_egg.webp?inline';
import greenPepperEgg from '../public/art/green_pepper_egg.webp?inline';
import tomato from '../public/art/tomato.webp?inline';
import vegetableCardFrame from '../public/art/cards/card_frame_veg.webp?inline';
import chineseCabbage from '../public/art/cards/chinese_cabbage.webp?inline';
export const art: Record<string, string> = {
  tomato_egg: tomatoEgg,
  green_pepper_egg: greenPepperEgg,
  tomato,
};

export const ingredientCardArt: Record<
  string,
  { frame: string; ingredient: string }
> = {
  chinese_cabbage: {
    frame: vegetableCardFrame,
    ingredient: chineseCabbage,
  },
};
