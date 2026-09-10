// Original game assets. Hosted builds use hashed URLs; standalone builds inline them.
import dish0 from '../assets/baiwei/dishes/boiled_fish.webp?url';
import dish1 from '../assets/baiwei/dishes/braised_pork.webp?url';
import dish2 from '../assets/baiwei/dishes/braised_trotter.webp?url';
import dish3 from '../assets/baiwei/dishes/char_siu.webp?url';
import dish4 from '../assets/baiwei/dishes/cola_chicken_wings.webp?url';
import dish5 from '../assets/baiwei/dishes/cold_wood_ear.webp?url';
import dish6 from '../assets/baiwei/dishes/fish_fragrant_pork.webp?url';
import dish7 from '../assets/baiwei/dishes/fish_head_chili.webp?url';
import dish8 from '../assets/baiwei/dishes/golden_egg.webp?url';
import dish9 from '../assets/baiwei/dishes/green_pepper_egg.webp?url';
import dish10 from '../assets/baiwei/dishes/green_pepper_pork.webp?url';
import dish11 from '../assets/baiwei/dishes/hairy_tofu.webp?url';
import dish12 from '../assets/baiwei/dishes/jiuzhuan_intestine.webp?url';
import dish13 from '../assets/baiwei/dishes/li_hotchpotch.webp?url';
import dish14 from '../assets/baiwei/dishes/lions_head.webp?url';
import dish15 from '../assets/baiwei/dishes/longjing_shrimp.webp?url';
import dish16 from '../assets/baiwei/dishes/mapo_tofu.webp?url';
import dish17 from '../assets/baiwei/dishes/onion_beef.webp?url';
import dish18 from '../assets/baiwei/dishes/oyster_omelette.webp?url';
import dish19 from '../assets/baiwei/dishes/pineapple_pork.webp?url';
import dish20 from '../assets/baiwei/dishes/roast_goose.webp?url';
import dish21 from '../assets/baiwei/dishes/saliva_chicken.webp?url';
import dish22 from '../assets/baiwei/dishes/scallion_sea_cucumber.webp?url';
import dish23 from '../assets/baiwei/dishes/shiitake_lettuce.webp?url';
import dish24 from '../assets/baiwei/dishes/spicy_crayfish.webp?url';
import dish25 from '../assets/baiwei/dishes/stinky_mandarin_fish.webp?url';
import dish26 from '../assets/baiwei/dishes/sweet_sour_carp.webp?url';
import dish27 from '../assets/baiwei/dishes/sweet_sour_ribs.webp?url';
import dish28 from '../assets/baiwei/dishes/tomato_egg.webp?url';
import dish29 from '../assets/baiwei/dishes/twice_cooked_pork.webp?url';
import dish30 from '../assets/baiwei/dishes/west_lake_fish.webp?url';
import dish31 from '../assets/baiwei/dishes/white_cut_chicken.webp?url';
import dish32 from '../assets/baiwei/dishes/tomato_egg_soup.webp?url';
import dish33 from '../assets/baiwei/dishes/cabbage_tofu_soup.webp?url';
import dish34 from '../assets/baiwei/dishes/carrot_ribs_soup.webp?url';
import dish35 from '../assets/baiwei/dishes/soybean_trotter_soup.webp?url';
import dish36 from '../assets/baiwei/dishes/fish_tofu_soup.webp?url';
import dish37 from '../assets/baiwei/dishes/chicken_mushroom_soup.webp?url';
import dish38 from '../assets/baiwei/dishes/west_lake_beef_soup.webp?url';
import dish39 from '../assets/baiwei/dishes/steamed_rice.webp?url';
import dish40 from '../assets/baiwei/dishes/braised_pork_rice.webp?url';
import dish41 from '../assets/baiwei/dishes/clay_pot_rice.webp?url';
import dish42 from '../assets/baiwei/dishes/egg_fried_rice.webp?url';
import dish43 from '../assets/baiwei/dishes/stir_fried_potato.webp?url';
import dish44 from '../assets/baiwei/dishes/mantou.webp?url';
import dish45 from '../assets/baiwei/dishes/yangchun_noodle.webp?url';
import dish46 from '../assets/baiwei/dishes/egg_fried_noodle.webp?url';
import dish47 from '../assets/baiwei/dishes/ginger_scallion_crab.webp?url';
import dish48 from '../assets/baiwei/dishes/sizzling_squid.webp?url';
import dish49 from '../assets/baiwei/dishes/garlic_oyster.webp?url';
import dish50 from '../assets/baiwei/dishes/steamed_crab.webp?url';
import dish51 from '../assets/baiwei/dishes/garlic_scallop.webp?url';
import dish52 from '../assets/baiwei/dishes/sanxian_pot.webp?url';
import dish53 from '../assets/baiwei/dishes/omurice.webp?url';
import dish54 from '../assets/baiwei/dishes/scallion_noodle.webp?url';
import dish55 from '../assets/baiwei/dishes/jianbing.webp?url';
import dish56 from '../assets/baiwei/dishes/guotie.webp?url';
import dish57 from '../assets/baiwei/dishes/crispy_chicken.webp?url';
import dish58 from '../assets/baiwei/dishes/cumin_lamb.webp?url';
import dish59 from '../assets/baiwei/dishes/lamb_noodle_soup.webp?url';
import dish60 from '../assets/baiwei/dishes/lotus_ribs_soup.webp?url';
import dish61 from '../assets/baiwei/dishes/stir_fried_lotus.webp?url';
import dish62 from '../assets/baiwei/dishes/matsutake_chicken_soup.webp?url';
import dish63 from '../assets/baiwei/dishes/pan_fried_matsutake.webp?url';
import dish64 from '../assets/baiwei/dishes/pickled_cabbage_pork.webp?url';
import dish65 from '../assets/baiwei/dishes/pickled_fish.webp?url';
import dish66 from '../assets/baiwei/dishes/coconut_chicken.webp?url';
import dish67 from '../assets/baiwei/dishes/coconut_rice.webp?url';
import dish68 from '../assets/baiwei/dishes/sausage_claypot_rice.webp?url';
import dish69 from '../assets/baiwei/dishes/steamed_cured_sausage.webp?url';
import plate from '../assets/baiwei/plates/plate_1.webp?url';
import spicyChicken from '../assets/baiwei/dishes/spicy_chicken.webp?url';
import greenPepperEggplant from '../assets/baiwei/dishes/green_pepper_eggplant.webp?url';
export const baiweiPlate = plate;
export const baiweiImages: Record<string, string> = {
  spicy_chicken: spicyChicken,
  green_pepper_eggplant: greenPepperEggplant,
  boiled_fish: dish0,
  braised_pork: dish1,
  braised_trotter: dish2,
  char_siu: dish3,
  cola_chicken_wings: dish4,
  cold_wood_ear: dish5,
  fish_fragrant_pork: dish6,
  fish_head_chili: dish7,
  golden_egg: dish8,
  green_pepper_egg: dish9,
  green_pepper_pork: dish10,
  hairy_tofu: dish11,
  jiuzhuan_intestine: dish12,
  li_hotchpotch: dish13,
  lions_head: dish14,
  longjing_shrimp: dish15,
  mapo_tofu: dish16,
  onion_beef: dish17,
  oyster_omelette: dish18,
  pineapple_pork: dish19,
  roast_goose: dish20,
  saliva_chicken: dish21,
  scallion_sea_cucumber: dish22,
  shiitake_lettuce: dish23,
  spicy_crayfish: dish24,
  stinky_mandarin_fish: dish25,
  sweet_sour_carp: dish26,
  sweet_sour_ribs: dish27,
  tomato_egg: dish28,
  twice_cooked_pork: dish29,
  west_lake_fish: dish30,
  white_cut_chicken: dish31,
  tomato_egg_soup: dish32,
  cabbage_tofu_soup: dish33,
  carrot_ribs_soup: dish34,
  soybean_trotter_soup: dish35,
  fish_tofu_soup: dish36,
  chicken_mushroom_soup: dish37,
  west_lake_beef_soup: dish38,
  steamed_rice: dish39,
  braised_pork_rice: dish40,
  clay_pot_rice: dish41,
  egg_fried_rice: dish42,
  stir_fried_potato: dish43,
  mantou: dish44,
  yangchun_noodle: dish45,
  egg_fried_noodle: dish46,
  ginger_scallion_crab: dish47,
  sizzling_squid: dish48,
  garlic_oyster: dish49,
  steamed_crab: dish50,
  garlic_scallop: dish51,
  sanxian_pot: dish52,
  omurice: dish53,
  scallion_noodle: dish54,
  jianbing: dish55,
  guotie: dish56,
  crispy_chicken: dish57,
  cumin_lamb: dish58,
  lamb_noodle_soup: dish59,
  lotus_ribs_soup: dish60,
  stir_fried_lotus: dish61,
  matsutake_chicken_soup: dish62,
  pan_fried_matsutake: dish63,
  pickled_cabbage_pork: dish64,
  pickled_fish: dish65,
  coconut_chicken: dish66,
  coconut_rice: dish67,
  sausage_claypot_rice: dish68,
  steamed_cured_sausage: dish69,
};
