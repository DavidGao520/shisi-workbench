# 主题资产与现实做法来源

日期：2026-09-05。项目归属：用户与 Jacky，国宴队，《中华食肆》。

## 2026-09-10 新增：作者六道实做与工作台新菜

- 原游戏 70 道资产、原作故事与文件哈希保持不变。辣子鸡、青椒茄子独立登记在 `lib/workbench-dishes.json`，标为“工作台新增”，不冒充游戏原作；现在共 72 道。
- 高源本人提供回锅肉、辣子鸡、青椒茄子、糖醋排骨、青椒炒肉、可乐鸡翅六张实拍及食忆。青椒炒肉由本人确认使用猪肉。图片保留完整构图，仅转正、缩放、转为 WebP；移除 EXIF/GPS 元数据。实拍不是 AI 插画，不把参考菜谱写成作者确实执行过的步骤，不填造评分与用量。
- 六张照片保存于 `assets/demo-meals/`，发布用 data URI 在 `lib/demo-meal-photos.json`；文件名、尺寸、SHA-256 与已知拍摄日期见随包 `demo-meal-provenance.json`。可乐鸡翅的照片没有拍摄时间元数据，显示“拍摄日期未记录”；不以导入日冒充下厨日。
- 默认样例保存 35 条虚构演练记录及 6 条作者实做，共 41 条、38 道点亮（其中三道重合）。升级只向样例补入缺失的作者记录，不重置库存、既有食忆、进行中的一餐和真实厨房；刷新不会重复新增。
- 辣子鸡插画用 Codex 内置 ImageGen 原创生成，为透明底食物主体，页面另配原作青花盘。原始 PNG 为 1254×1254，保留 alpha 转为 WebP，未改绘。青椒茄子首次生成因网络错误失败，目前用本人实拍作为菜品图，明确标为“作者实拍”，独立插画尚待补齐。完整提示词见 [本次生成记录](DISH-ART-PROMPTS-2026-09-10.md)。

新增配方与原作者页面见 [中文菜谱来源索引](CHINESE-RECIPE-SOURCES.md)。实做照片与参考配方分开标注，不代表这些定量改编配方已通过逐道试做验收。

## 2026-09-06 新增：70 道百味图

百味图使用 [Chinese-Cuisine beta 0.6](https://github.com/4567lizhen/Chinese-Cuisine/tree/ae825f252ae982ec05d359edff44e226cef2fca2) 的完整 70 道菜单：

- `src/data/dishes.ts` → 菜名、描述、故事原文；不移植游戏价格、效果或收益作为现实数据。
- `public/assets/dishes/*.webp` → 70 张原图，保存为 `assets/baiwei/dishes/*.webp`。
- `public/assets/plates/plate_1.webp` → 默认通用盘子，保存为 `assets/baiwei/plates/plate_1.webp`。
- `src/ui/cardArt.ts` 和 `src/data/recipes.ts` → 仅提取容器分类和插画摆放，不移植游戏配方为现实步骤。21 道自带容器、49 道使用盘子，14 道汤保持 75% 缩放，白米饭为 82%，其他自带容器为 92%。

逐图 Git SHA-1、SHA-256、文件字节数在 `lib/baiwei-dishes.json`；来源提交及盘子哈希在 `docs/baiwei-provenance.json`。全部 71 个原文件读取并验证哈希，无生成、改绘、裁切或压缩。验证文件不等于人工视觉验收。

故事在详情标注为“游戏原作故事”，含传说和文学表达，**尚未逐条核实史实，也不是烹饪或健康建议**。用户的成品照和记忆另外显示，不与原作故事或图画混淆。新增图鉴已取得真正的番茄蛋汤成品插画；下面旧三道菜入口的历史来源记录保持不变。

## 2026-09-06 新增：70 道预设中文家常做法

全部 70 道图鉴现在对应可直接查看的现实做法，版本 `2026-09-06-home.1`。包括原有三道菜的新开餐版本，均已改用中文参考。完整的作者、原文链接、支持范围与家庭改编说明见 [中文菜谱来源索引](CHINESE-RECIPE-SOURCES.md)，数据和 456 个详细步骤在 `lib/home-recipes.json`。

仅迁移游戏菜名、插画、原作故事；实际配方、火候和时长独立整理。时间、份量和食材替换为家庭改编，不冒充原作者全部原值、实际试做记录或专业审校。通用熟度参考 [香港食物安全中心《烹煮及翻热》](https://www.cfs.gov.hk/sc_chi/trade_zone/safe_kitchen/Cooking_and_reheating.html)。

## 2026-09-06 新增：四张工作台补充库存插画

`食用油`、`料酒`、`淀粉` 与 `熟米饭` 是现实厨房需要、但不属于游戏百味图 47 种食材与 16 种调料目录的独立库存身份。它们继续沿用同一套动态卡框与现实库存信息，但没有冒充为 Chinese-Cuisine 原作素材。

四张主体图使用 Codex 内置 ImageGen 生成，以本项目已有卡图作为画风 / 构图参考：油与料酒参考透明玻璃调料瓶，淀粉参考开口纸袋与细白粉，熟米饭参考碗形与米粒色泽。提示词统一要求 2D 暖色手绘、透明底、主体居中、无卡框、无可读文字、无品牌与水印；料酒和淀粉另经同一工具提取真实透明背景。最终使用 Sharp 缩放并编码为 512×512 带 alpha 的 WebP，原始生成 PNG 不进入项目运行时。

| 工作台身份 | 运行时文件 | 画面语义 | SHA-256 |
| --- | --- | --- | --- |
| `oil` / 食用油 | `public/art/cards/oil.webp` | 红盖透明壶装金黄色食用油，无字麦穗标 | `43382f44115d89fb67d1e6cdf5b83002dee3fc52a69d103553adb16c672a1aca` |
| `cooking_wine` / 料酒 | `public/art/cards/cooking_wine.webp` | 红盖玻璃瓶装琥珀色料酒，无字谷穗标 | `aaaed8082829b0963927e2974131c68e36e177e63fd7ec431609f24183fbc70b` |
| `starch` / 淀粉 | `public/art/cards/starch.webp` | 开口牛皮纸袋中的细白淀粉，无字几何纹样 | `cf83e0428797760d79ae9cf7014ae5c92874297f45eb904b39dd3e9caf5b9457` |
| `cooked_rice` / 熟米饭 | `public/art/cards/cooked_rice.webp` | 米白陶碗中的黏连熟米饭，区别于散装生米 | `bbf1d920f077fe361120822669bf3189eb3ff168d5fa0604c32bc67317b38a31` |

该次补充后，库存运行时包含 63 张游戏原图与 4 张工作台补充图。四项只扩展 `pantryCardArt`，不改变 `baiweiPantry` 的 63 项原作来源契约，也不把 `rice.webp` 的生米画面用于熟米饭。

## 2026-09-07 新增：样例厨房缺失的四张库存插画

当前工作台与本机原作卡图目录未提供白胡椒粉、干辣椒、香油、饮用水对应主体图。使用 Codex 内置 ImageGen 为四项分别生成原创补充素材，不复用花椒、鲜辣椒或食用油冒充，不改变原作 63 项目录。

画风参考仅来自人工查看本项目现有 `starch.webp`、`cooking_wine.webp`、`chili.webp`、`oil.webp` 后写入提示词的风格描述；本次是四次独立的新图生成，没有传入编辑目标。生成的 1254×1254 PNG 均自带真实 alpha，未抠图或改绘；保留透明通道，用 Sharp 缩放为 512×512、quality 90 / effort 6 的 WebP。

| 工作台身份 | 运行时文件 | 画面与卡框 | SHA-256 |
| --- | --- | --- | --- |
| `white_pepper` / 白胡椒粉 | `public/art/cards/white_pepper.webp` | 象牙白陶碗中的浅米色胡椒粉与白胡椒粒；橙色调料框 | `af1abd70b07dc4c7290e20c8b8b3a837c8702d2ab25daba221b585fdbe903a27` |
| `dried_chili` / 干辣椒 | `public/art/cards/dried_chili.webp` | 深红皱皮、干燥棕梗及断开的辣椒荚；橙色调料框 | `87b29a944cf35a7d1b131b275d05bd4a0255c97ad99e3b44a7430300f3cad9f2` |
| `sesame_oil` / 香油 | `public/art/cards/sesame_oil.webp` | 木塞小玻璃壶中的深琥珀色香油与芝麻；橙色调料框 | `0a5a9e708f225bf4c65d6a995b409d7fd6820bb8aa88221df3534c690cf19d8f` |
| `water` / 饮用水 | `public/art/cards/water.webp` | 带把玻璃清水壶；绿色食材框 | `4d2b133a0b9402199c36e577d15f7f904e831f6afe7970c33a793c4ab4cfbdca` |

当前库存素材合计 63 张游戏原图 + 8 张工作台补充图。四项扩展 `workbenchSupplementalCardArt` 并使用 `?inline` 打包；待确认、已确认库存和独立 HTML 共用映射。样例厨房的 22 项库存全部有图。图中容器、液面和颗粒仅作身份示意，不代表库存中的实际品牌、包装或数量。参观流程、批次、配方身份和数量逻辑未改。

<details>
<summary>四次内置 ImageGen 调用的完整最终提示词</summary>

### white_pepper

```text
Use case: stylized-concept.
Asset type: square transparent ingredient sprite for 中华食肆, a contemporary Chinese neighborhood restaurant card management game.
Scene/backdrop: genuinely transparent RGBA background with native alpha, completely empty outside the subject; the sprite will be placed over cream parchment UI.
Style/medium: detailed hand-painted 2D game ingredient illustration, tactile gently brushed gouache-like textures, rich natural material shading, clean fine warm-brown outer contours, rounded appealing forms, crisp silhouette, soft upper-left highlights. Visually consistent with kitchen card sprites showing a folded tan paper sack of starch, amber cooking wine in a glass bottle, red fresh chilies, and bright yellow oil in a red-capped cruet. This is polished painterly game art, not a photograph, flat vector icon, or 3D render.
Composition/framing: a single centered isolated subject group in a square image, three-quarter slightly overhead view, fully visible and uncropped; the subject's longest dimension should occupy about 80–85% of the square with generous clear breathing margin. No ground plane or cast-shadow puddle.
Constraints: native true transparent background, clean antialiased alpha edges, no opaque white background, no black background, no baked checkerboard; no card frame, no decorative backdrop, no text, no brand, no logo, no watermark.
Primary request: illustrate white pepper powder as a small ivory ceramic bowl heaped with fine beige-white ground pepper powder, with just a few pale cream whole white peppercorns beside the bowl.
Subject and materials: squat simple ceramic bowl with a subtly warm tan rim and gentle ivory glaze; visible mound of very finely ground warm pale beige powder with a matte, slightly grainy surface; three to five pale cream peppercorns beside its base, subtly wrinkled. The contents should clearly be ground white pepper, not salt crystals, starch, or black pepper. Avoid brilliant pure white crystalline granules, dark black pepper grains, spoons, cloth, or other props.
```

### dried_chili

```text
Use case: stylized-concept.
Asset type: square transparent ingredient sprite for 中华食肆, a contemporary Chinese neighborhood restaurant card management game.
Scene/backdrop: genuinely transparent RGBA background with native alpha, completely empty outside the subject; the sprite will be placed over cream parchment UI.
Style/medium: detailed hand-painted 2D game ingredient illustration, tactile gently brushed gouache-like textures, rich natural material shading, clean fine warm-brown outer contours, rounded appealing forms, crisp silhouette, soft upper-left highlights. Visually consistent with kitchen card sprites showing a folded tan paper sack of starch, amber cooking wine in a glass bottle, red fresh chilies, and bright yellow oil in a red-capped cruet. This is polished painterly game art, not a photograph, flat vector icon, or 3D render.
Composition/framing: a single centered isolated subject group in a square image, three-quarter slightly overhead view, fully visible and uncropped; the subject's longest dimension should occupy about 80–85% of the square with generous clear breathing margin. No ground plane or cast-shadow puddle.
Constraints: native true transparent background, clean antialiased alpha edges, no opaque white background, no black background, no baked checkerboard; no card frame, no decorative backdrop, no text, no brand, no logo, no watermark.
Primary request: illustrate a compact cluster or fan of five to six deep red dried chili pods, each with dry tan stems, plus one broken pod revealing a few pale seeds.
Subject and materials: distinctly dried, thin curled wrinkled chili skins in deep brick red and muted crimson, papery ridges and matte uneven warm highlights, dry woody tan stems; an appealing compact overlapping fan, a broken pod section and only a few pale cream seeds next to it. Preserve legibility at small card size. Absolutely no glossy plump fresh peppers, bright green stems, bowl, plate, cloth, or other props.
```

### sesame_oil

```text
Use case: stylized-concept.
Asset type: square transparent ingredient sprite for 中华食肆, a contemporary Chinese neighborhood restaurant card management game.
Scene/backdrop: genuinely transparent RGBA background with native alpha, completely empty outside the subject; the sprite will be placed over cream parchment UI.
Style/medium: detailed hand-painted 2D game ingredient illustration, tactile gently brushed gouache-like textures, rich natural material shading, clean fine warm-brown outer contours, rounded appealing forms, crisp silhouette, soft upper-left highlights. Visually consistent with kitchen card sprites showing a folded tan paper sack of starch, amber cooking wine in a glass bottle, red fresh chilies, and bright yellow oil in a red-capped cruet. This is polished painterly game art, not a photograph, flat vector icon, or 3D render.
Composition/framing: a single centered isolated subject group in a square image, three-quarter slightly overhead view, fully visible and uncropped; the subject's longest dimension should occupy about 80–85% of the square with generous clear breathing margin. No ground plane or cast-shadow puddle.
Constraints: native true transparent background, clean antialiased alpha edges, no opaque white background, no black background, no baked checkerboard; no card frame, no decorative backdrop, no text, no brand, no logo, no watermark.
Primary request: illustrate a small clear glass condiment cruet with a wooden stopper, filled with dark amber toasted sesame oil, with a few sesame seeds beside the base and no label.
Subject and materials: compact rounded glass cruet with a short neck, a small curved handle and subtle pouring lip, natural warm-brown wooden stopper, dark amber translucent oil with deep caramel-brown shadows and warm copper highlights; fine painterly glass reflections, a few ivory sesame seeds by the base. Its silhouette and colors must remain visibly distinct from a tall bright-yellow cooking-oil jug with a red cap: here use a shorter rounder bottle, wooden stopper, dark toasted amber liquid, completely unlabelled glass. No red cap, no yellow cooking oil, no labels or writing, no extra props.
```

### water

```text
Use case: stylized-concept.
Asset type: square transparent ingredient sprite for 中华食肆, a contemporary Chinese neighborhood restaurant card management game.
Scene/backdrop: genuinely transparent RGBA background with native alpha, completely empty outside the subject; the sprite will be placed over cream parchment UI.
Style/medium: detailed hand-painted 2D game ingredient illustration, tactile gently brushed gouache-like textures, rich natural material shading, clean fine warm-brown outer contours, rounded appealing forms, crisp silhouette, soft upper-left highlights. Visually consistent with kitchen card sprites showing a folded tan paper sack of starch, amber cooking wine in a glass bottle, red fresh chilies, and bright yellow oil in a red-capped cruet. This is polished painterly game art, not a photograph, flat vector icon, or 3D render.
Composition/framing: a single centered isolated subject group in a square image, three-quarter slightly overhead view, fully visible and uncropped; the subject's longest dimension should occupy about 80–85% of the square with generous clear breathing margin. No ground plane or cast-shadow puddle.
Constraints: native true transparent background, clean antialiased alpha edges, no opaque white background, no black background, no baked checkerboard; no card frame, no decorative backdrop, no text, no brand, no logo, no watermark.
Primary request: illustrate a simple clear squat glass water jug with a handle and pouring spout, three-quarters full of COLORLESS drinking water.
Subject and materials: a short broad clear glass pitcher with a comfortably rounded glass handle, open top and modest pouring spout; visible elliptical waterline at three-quarter height, clear colorless water, delicate cool white and pale blue reflective accents along glass rims and edges, fine warm neutral brown outer contour so it remains readable on cream parchment. Interior must read as transparent colorless drinking water; reflections may be faint blue but the liquid must not appear blue, amber, yellow, or milky. No lid, no stopper, no ice, no lemon, no plants, no labels, no writing, no other objects.
```

</details>

## 2026-09-07 新增：照片库存的鸡翅、可乐原图与生菜展示映射

从 Chinese-Cuisine 提交 `ae825f252ae982ec05d359edff44e226cef2fca2` 提取两张原始 WebP，经逐文件 Git blob / SHA-256 校验并打开查看；不生成、改绘、压缩或裁切。

| 展示用途 | 原作文件 → 工作台文件 | Git blob | SHA-256 |
| --- | --- | --- | --- |
| 鸡翅 | `public/assets/cards/鸡翅中.webp` → `public/art/cards/chicken_wings.webp` | `096244f577986b57d78ff1d511d320540fc31480` | `e753e2f9a7bd5d810bc36efadc5647732884936e9644b79665abee8afd8f0c44` |
| 可乐 | `public/assets/cards/qianshi_cola.webp` → `public/art/cards/cola.webp` | `e6d49ed535772dda4bf36efac5db92ffa168b24d` | `a846457a7d9c90283e39b29558fb2a680fbf88a8472963ec3d79c581fe5b6703` |

两张均为 512×512 透明主体图，分别使用现有荤食框与食材框，以 `?inline` 进入网页和独立 HTML。可乐原图为游戏内“千事可乐”，仅作可乐类别插画，不代表用户库存的实际品牌或包装。当前库存主体图共 65 张游戏原图 + 8 张工作台生成补充图；原作百味图的 63 项食材/调料目录不变。

按用户明确选择，“生菜”复用已导入的 `chinese_cabbage.webp` 白菜插画。该复用只发生在 `lib/pantry-art.ts` 展示映射：名称仍为“生菜”，不合并白菜库存、不替代白菜配方，不冒充生菜专用原画。鸡翅与可乐也支持此前已保存为 `other` 的明确名称；不迁移批次、数量或到期日，不从品牌名称推断含糖量。待确认卡、已确认卡和独立 HTML 共用映射。

以下保留 0.1 的历史来源台账，仅用于解释旧快照和旧素材；不是当前 70 道菜谱的来源或限制。

## 历史 0.1：从游戏迁移了什么

| 工作台目标 | 原素材位置 | 迁移内容 | 不迁移内容 |
| --- | --- | --- | --- |
| 西红柿炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/tomato_egg.webp | 原游戏菜品图、菜名对应 | 卡牌效果、收益、饱腹/火候数值 |
| 青椒炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/green_pepper_egg.webp | 原游戏菜品图、菜名对应 | 游戏数值、现实加热时长 |
| 番茄蛋汤 / 食材入口插画 | Desktop/中华食肆/Demo/assets/cards/tomato.webp | 原游戏番茄插画；明确不是成品汤照 | 不拿番茄图冒充用户成品照 |
| 百味图食材与调料库存卡 | `4567lizhen/Chinese-Cuisine@ae825f252ae982ec05d359edff44e226cef2fca2` 的 `src/data/ingredients.ts`、`src/data/seasonings.ts` 与 `public/assets/cards/*.webp` | 47 种食材、16 种调料的透明插画及蔬菜 / 荤食 / 调料空卡框；工作台动态叠加名称、类别、校准状态、数量、到期日 | 饱腹横签、行动点、口味、技能文案与其他战斗数值 |
| 我的厨房 / 百味图 | 用户提供的游戏截图 | 食材分类、收录与详情结构、暖色食肆视觉 | 不照搬战斗卡牌属性作为现实饮食知识 |

这些原图从本机 Demo 目录复制，已打开核对；该目录不在 Git 内，**原图对应提交未知**。已知的另一个 sparse 游戏仓库 HEAD 为 ae825f252ae982ec05d359edff44e226cef2fca2，不能据此声称本机 Demo 图恰好来自该提交。番茄蛋汤原图未成功取得，因此本版使用明确标注的原游戏番茄食材插画，没有生成或伪装成品图。

库存卡素材直接从上表所列游戏提交提取。工作台以同一套大白菜卡片结构展示全部 63 项，并按游戏原分类使用绿色蔬食框、红色荤食框或橙色调料框；卡内只写现实库存信息。`rice.webp` 是生米插画，因此工作台保留“生大米”语义，不把它用于“熟米饭”。`scallion`（大葱）与 `spring_onion`（小葱）保持独立 ID，避免串图。

三种卡框和 63 张运行时插画都以 WebP 放入自包含构建；其中原大白菜素材 SHA-256 仍为 `ab272cacd97053ed7cfc7c1babf675ecca0b0481d4406a11685608b3dfcf5b54`（蔬菜卡框）与 `a4a243b0a7a1f9716450c1fd147a376bec5f12ce39ef57b1de2328f55c2765f5`（白菜）。两个仓库均服务于用户与 Jacky 的同一项目；游戏仓库未提供可据以对外授权的 LICENSE，公开再分发前仍需团队确认素材权利。

## 历史 0.1：三道现实菜谱

均为“参考原作者做法、调整为单人家庭版本”的草稿，核对来源不等于实做审核。待有烹饪经验的人逐项核对，应用才记录个人审校人、时间与版本。菜谱版本：2026-09-05-draft.1。

| 菜品 | 做法依据 | 本版改动 | 初始审校 |
| --- | --- | --- | --- |
| 西红柿炒鸡蛋 | [Sarah / The Woks of Life](https://thewoksoflife.com/stir-fried-tomato-and-egg/) | 单人份；简化调味，保留先蛋后番茄再合炒顺序 | draft |
| 青椒炒鸡蛋 | [Elaine / China Sichuan Food](https://www.chinasichuanfood.com/egg-and-pepper-stir-fry/) | 单人份；青椒细切拌蛋液后煎炒，使用不辣青椒 | draft |
| 番茄蛋汤 | [Maggie Zhu / Omnivore’s Cookbook](https://omnivorescookbook.com/tomato-egg-drop-soup/) | 单人份；清水替代高汤，去掉可选勾芡，保留慢淋蛋液 | draft |

安全提示依据：[FDA — Egg Safety](https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-egg-safety)。用时为制作估计，提醒不是熟度判断。鸡蛋过敏硬过滤；生抽涉及大豆、小麦，以用户实际产品标签为准。

## 历史 0.1：文化 / 记忆边界

本版只包含上述作者来源支持的家常做法微知识，没有补造历史起源、名人故事或“正宗”判断。用户填写的家庭故事始终标为“个人记忆 · 用户自述”，不升级为史实。四层文化事实 schema 的完整内容库后续扩充；不以空标签宣称已经完成文化百科。
