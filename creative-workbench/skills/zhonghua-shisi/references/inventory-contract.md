# 食材候选协议 1.0

自动连接模式使用 local-bridge.md：提取文件允许省略 requestId / createdAt / dataset / mode，由用户在网页创建的 ticket 固定；自动连接还允许 candidates: [] 表达未识别到食材。下方是内部协议示例，网页已移除手动 JSON 导入，不要求用户搬运 JSON。网页语音独立产生 gateway-text 候选，不使用本对话的 ticket；仍由页面确认后才入庫。

完整包示例：

```json
{
  "schemaVersion": "1.0",
  "requestId": "example-20260905-text-001",
  "dataset": "real",
  "mode": "stocktake",
  "source": "workbuddy-voice-transcript",
  "transcript": "冰箱里有两个番茄、一盒鸡蛋，还有点青椒和剩饭",
  "createdAt": "2026-09-05T18:00:00+08:00",
  "warnings": ["照片和文字不证明食材当前可食用，需用户确认。"],
  "candidates": [
    {"candidateId":"c01","displayName":"番茄","canonicalIngredientId":"tomato","rawMention":"两个番茄","amount":2,"unit":"个","warnings":["按克计量的菜谱仍需用户确认重量，不自动换算。"]},
    {"candidateId":"c02","displayName":"鸡蛋","canonicalIngredientId":"egg","rawMention":"一盒鸡蛋","amount":1,"unit":"盒","warnings":["盒内枚数需用户确认。"]},
    {"candidateId":"c03","displayName":"青椒","canonicalIngredientId":"green_pepper","rawMention":"有点青椒","amountBand":"少量","warnings":["模糊数量，需用户确认。"]},
    {"candidateId":"c04","displayName":"熟米饭","canonicalIngredientId":"cooked_rice","rawMention":"剩饭","warnings":["数量未知；保存情况和是否仍适宜食用需用户自行确认。"]}
  ]
}
```

- dataset：real / demo；由当前 HTML 环境绑定。不得把 demo 候选放进真实厨房。
- mode：stocktake / restock；用户主动选择，默认盘点。
- source：workbuddy-image 或 workbuddy-voice-transcript；不要把模拟样例标成真实照片。
- 必填：schemaVersion、requestId、source、createdAt、warnings、candidates。完整 Envelope 还需 dataset、mode。缺元数据的提取结果不是完整协议通过。
- candidates：1–50 项，每项 candidateId 在本包唯一、displayName、warnings 数组。rawMention 只保留真实原片段；图片无需伪造“原话”。
- amount 是非负有限数，必须搭配 unit：个 / 盒 / 袋 / 棵 / 克 / 毫升 / 份。不自动把瓶、碗、根换成份。 unsupported 原量词写入 rawMention 或 warnings，amount 留空。
- amountBand：充足 / 少量 / 即将用完；与 amount 互斥。没有数量依据时，两个都不写。
- confidence 可选 0–1，不是食品安全或新鲜度判断。
- 百味图 47 种食材 canonicalIngredientId：tomato / egg / potato / pork / rice / tofu / green_pepper / onion / shiitake_mushrooms / lamb_lettuce / carrot / chinese_cabbage / eggplant / green_beans / soy_beans / flour / noodle / lemon / milk / chicken_drum / pork_ribs / steak / fish / shrimp / pork_belly / whole_chicken / crayfish / wood_ear / cucumber / pineapple / scallion / tea_leaves / clam / sea_cucumber / pork_intestine / pig_trotter / goose / crab / squid / oyster / scallop / lamb / lotus_root / matsutake / pickled_cabbage / coconut / cured_sausage。
- 百味图 16 种调料 canonicalIngredientId：salt / chili / vinegar / sugar / bay_leaf / chili_oil / cumin / dark_soy_sauce / doubanjiang / garlic / ginger / spring_onion / sichuan_pepper / soy_sauce / star_anise / cilantro。工作台还支持 oil / cooking_wine / starch 等清单内调料。
- 现实库存另外区分 water 与 cooked_rice；游戏 rice 的图是生米，所以“米饭 / 熟米饭 / 剩饭”使用 cooked_rice，“大米 / 生大米”使用 rice。scallion 是大葱，spring_onion 是小葱。其他不认识的食材可留空或使用 other；不得硬套错误 ID。
- confirmed 不能出现在候选协议中。HTML 即便收到也会忽略，用户仍需确认。
- 新照片/新盘点用新 requestId；同次结果重传保留 ID，避免重复入库。
- 页面遇到不支持的单位，会保留警告并清空精确数量等待确认，而不是静默转换。
