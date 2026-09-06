# 主题资产与现实做法来源

日期：2026-09-05。项目归属：用户与 Jacky，国宴队，《中华食肆》。

## 从游戏迁移了什么

| 工作台目标 | 原素材位置 | 迁移内容 | 不迁移内容 |
| --- | --- | --- | --- |
| 西红柿炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/tomato_egg.webp | 原游戏菜品图、菜名对应 | 卡牌效果、收益、饱腹/火候数值 |
| 青椒炒鸡蛋菜谱封面 | Desktop/中华食肆/Demo/assets/dishes/green_pepper_egg.webp | 原游戏菜品图、菜名对应 | 游戏数值、现实加热时长 |
| 番茄蛋汤 / 食材入口插画 | Desktop/中华食肆/Demo/assets/cards/tomato.webp | 原游戏番茄插画；明确不是成品汤照 | 不拿番茄图冒充用户成品照 |
| 大白菜工作台库存卡 | `4567lizhen/Chinese-Cuisine@ae825f252ae982ec05d359edff44e226cef2fca2` 的 `public/assets/cards/card_frame_veg.webp` 与 `chinese_cabbage.webp` | 蔬菜空卡框与透明白菜插画；工作台动态叠加名称、校准状态、数量、到期日 | 饱腹横签、行动点、技能文案与其他战斗数值 |
| 我的厨房 / 百味图 | 用户提供的游戏截图 | 食材分类、收录与详情结构、暖色食肆视觉 | 不照搬战斗卡牌属性作为现实饮食知识 |

这些原图从本机 Demo 目录复制，已打开核对；该目录不在 Git 内，**原图对应提交未知**。已知的另一个 sparse 游戏仓库 HEAD 为 ae825f252ae982ec05d359edff44e226cef2fca2，不能据此声称本机 Demo 图恰好来自该提交。番茄蛋汤原图未成功取得，因此本版使用明确标注的原游戏番茄食材插画，没有生成或伪装成品图。

大白菜卡是例外：两份素材直接从上表所列游戏提交的 Git 对象提取，SHA-256 分别为 `ab272cacd97053ed7cfc7c1babf675ecca0b0481d4406a11685608b3dfcf5b54`（蔬菜卡框）和 `a4a243b0a7a1f9716450c1fd147a376bec5f12ce39ef57b1de2328f55c2765f5`（白菜）。两个仓库均服务于用户与 Jacky 的同一项目；游戏仓库未提供可据以对外授权的 LICENSE，公开再分发前仍需团队确认素材权利。

## 三道现实菜谱

均为“参考原作者做法、调整为单人家庭版本”的草稿，核对来源不等于实做审核。待有烹饪经验的人逐项核对，应用才记录个人审校人、时间与版本。菜谱版本：2026-09-05-draft.1。

| 菜品 | 做法依据 | 本版改动 | 初始审校 |
| --- | --- | --- | --- |
| 西红柿炒鸡蛋 | [Sarah / The Woks of Life](https://thewoksoflife.com/stir-fried-tomato-and-egg/) | 单人份；简化调味，保留先蛋后番茄再合炒顺序 | draft |
| 青椒炒鸡蛋 | [Elaine / China Sichuan Food](https://www.chinasichuanfood.com/egg-and-pepper-stir-fry/) | 单人份；青椒细切拌蛋液后煎炒，使用不辣青椒 | draft |
| 番茄蛋汤 | [Maggie Zhu / Omnivore’s Cookbook](https://omnivorescookbook.com/tomato-egg-drop-soup/) | 单人份；清水替代高汤，去掉可选勾芡，保留慢淋蛋液 | draft |

安全提示依据：[FDA — Egg Safety](https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-egg-safety)。用时为制作估计，提醒不是熟度判断。鸡蛋过敏硬过滤；生抽涉及大豆、小麦，以用户实际产品标签为准。

## 文化 / 记忆边界

本版只包含上述作者来源支持的家常做法微知识，没有补造历史起源、名人故事或“正宗”判断。用户填写的家庭故事始终标为“个人记忆 · 用户自述”，不升级为史实。四层文化事实 schema 的完整内容库后续扩充；不以空标签宣称已经完成文化百科。
