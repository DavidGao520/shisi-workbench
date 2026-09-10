# 2026-09-10 工作台新增菜品插画

工具：Codex 内置 ImageGen；无 CLI/API 密钥路径。查看现有青椒炒肉、鱼香肉丝食物主体后描述画风；没有对用户实拍进行生成或编辑。

辣子鸡：已生成，运行时 `assets/baiwei/dishes/spicy_chicken.webp`，Git blob SHA-1 `046280a3f9c0286499fe03bd9ccdf9fc3f9d834f`。原 PNG 1254×1254，透明 RGBA；仅转换 WebP，不去除或改画主体。

青椒茄子：首次请求网络错误，未返回图片；用户再次要求补齐后，使用下方相同提示词重新请求一次并成功。运行时 `assets/baiwei/dishes/green_pepper_eggplant.webp`，Git blob SHA-1 `2007e1ca94726f9399237f2dec79698ea76ffb59`。原 PNG 1254×1254，真实 RGBA，四角完全透明；保留 alpha 以 quality 90 转为 WebP，未抠图或改绘。主图已改为独立插画配原作青花盘，实拍只用于实做记录与缩略图，照片和食忆未改动。

以下为完整最终提示词。每个菜品请求使用通用部分加对应菜品段。

## 通用部分

```text
Use case: stylized-concept
Asset type: original raster food cutout sprite for a contemporary Chinese neighborhood restaurant game.
Scene/backdrop: genuinely transparent alpha background, all pixels outside the food silhouette transparent. The game supplies its own blue-white plate separately.
Style/medium: semi-realistic richly detailed painterly Chinese game food illustration, warm appetizing glossy highlights, subtle brushwork, tangible cooked-food texture. Match the observed reference style: compact generous mound with realistic ingredients, warm orange-brown gloss, crisp natural ingredient edges, rich depth, gentle painted shading.
Composition/framing: exactly one mound centered within a square 1024 x 1024 canvas; elevated three-quarter overhead view; whole food silhouette visible with generous clear margin on every side, roughly 12 percent padding. Food only, clean cutout.
Lighting/mood: soft warm studio illumination with appetizing restrained highlights and rich ingredient colors.
Constraints: create a new original dish asset, not an edit of any provided image. No plate, no bowl, no tray, no serving vessel, no table, no floor, no cutlery, no text, no people, no logos, no watermark. No background-colored rectangle, no checkerboard pattern, no drop shadow outside the food. Preserve real transparency in the delivered image.
```

## 辣子鸡

```text
Primary request: 辣子鸡 (Sichuan dry chili chicken).
Subject: a compact mound of bite-size golden-brown crisp-fried chicken pieces, surrounded and interspersed with many short deep-red dried-chili segments; some cut chili openings visible. A little dark Sichuan peppercorn, a few golden garlic pieces and very small fresh green scallion accents. The chicken remains clearly identifiable among the chilis.
Materials/textures: crisp irregular golden chicken crust, dark crimson wrinkled dried chili skins, a thin warm red-brown sheen of aromatic oil; appetizing dry stir-fry, no puddle of sauce.
Avoid: soup, curry, watery gravy, whole chicken, large drumsticks, heavy batter balls, peanuts, garnish leaves, plates.
```

## 青椒茄子

```text
Primary request: 青椒茄子 (green pepper and eggplant stir-fry), an entirely meat-free Chinese home-style dish.
Subject: a compact mound of soft glossy eggplant chunks and thick oblique slices with clearly visible purple skins and pale tender interior, mixed with fresh green-pepper rings and curved strips plus finely minced garlic. Make the eggplant the majority ingredient and the green peppers visibly recognizable.
Materials/textures: silky tender cooked eggplant, deep purple skin, pale cream and golden cooked flesh, fresh rich-green peppers, a thin warm brown light sauce clinging to the vegetables, gentle glossy highlights.
Avoid: any meat, chicken, pork, beef, seafood, tofu, purple sweet potato, soup, curry, watery gravy, floating ingredients, heavy sauce puddle, plates.
```
