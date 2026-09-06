# 主题资产与现实做法来源

日期：2026-09-05。项目归属：用户与 Jacky，国宴队，《中华食肆》。

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

当前库存运行时因此包含 63 张游戏原图与 4 张工作台补充图。四项只扩展 `pantryCardArt`，不改变 `baiweiPantry` 的 63 项原作来源契约，也不把 `rice.webp` 的生米画面用于熟米饭。

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
