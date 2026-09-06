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

以下保留 0.1 的历史来源台账，仅用于解释旧快照和旧素材；不是当前 70 道菜谱的来源或限制。

## 历史 0.1：从游戏迁移了什么

| 工作台目标 | 原素材位置 | 迁移内容 | 不迁移内容 |
| --- | --- | --- | --- |
| 西红柿炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/tomato_egg.webp | 原游戏菜品图、菜名对应 | 卡牌效果、收益、饱腹/火候数值 |
| 青椒炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/green_pepper_egg.webp | 原游戏菜品图、菜名对应 | 游戏数值、现实加热时长 |
| 番茄蛋汤 / 食材入口插画 | Desktop/中华食肆/Demo/assets/cards/tomato.webp | 原游戏番茄插画；明确不是成品汤照 | 不拿番茄图冒充用户成品照 |
| 我的厨房 / 百味图 | 用户提供的游戏截图 | 食材分类、收录与详情结构、暖色食肆视觉 | 不照搬战斗卡牌属性作为现实饮食知识 |

这些原图从本机 Demo 目录复制，已打开核对；该目录不在 Git 内，**原图对应提交未知**。已知的另一个 sparse 游戏仓库 HEAD 为 ae825f252ae982ec05d359edff44e226cef2fca2，不能据此声称本机 Demo 图恰好来自该提交。番茄蛋汤原图未成功取得，因此本版使用明确标注的原游戏番茄食材插画，没有生成或伪装成品图。

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
