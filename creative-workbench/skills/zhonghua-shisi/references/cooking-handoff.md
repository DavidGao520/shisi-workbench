# 选定菜品 → WorkBuddy 做法 → 页面跟做

这是用户明确选择的交接形式。复用已有厨房连接、使用用户自己的 WorkBuddy 对话；不调用外部模型 API，不下载本地模型，不新增周期任务。网页只准备请求并接收结果，不能自行唤醒对话。

## 读取请求

定位用户已指定的完整工作台目录，按 local-bridge.md 使用同一入口与工作台，不能改端口、换目录或清库存。推荐菜的“跟着做这道菜”只打开现有预设步骤，不创建任务。用户须在详情展开“可选：请 WorkBuddy 另写一版做法”，显式点击生成按钮，再在本对话说“读取厨房任务，生成做菜步骤”。此时执行：

```sh
node "/已确认的Skill目录/scripts/kitchen-bridge.mjs" cooking-task --workspace "/已确认的完整工作台目录"
```

返回 task 为 null 时，说明没有等待中的做法任务。请用户先在页面显式请求生成；不猜测、不自行创建任务。任务的 ticketId / dataset / recipeId / baseVersion / title / servings / ingredients 是页面绑定的数据，servings 是基础人数（整数 1–12），不是固定一人份，ingredients 已是这些人数的总量，不能再乘一次人数。只处理当前任务，不使用照片的 active ticket，不读取浏览器数据库、runtime.json、账号凭据或其他用户目录。

## 生成并交回

1. 在本 WorkBuddy 对话中，根据 request.title 与 ingredients 生成 3–20 条可操作步骤，说明准备、下锅顺序、火力、必要提醒与约需时间。保持菜名、食材和计划总用量不变。调料、水也只使用清单已有项；分次使用不能超过总量。不擅自换算盒/袋或推断库存足量。
2. 若有用料不足、做法适用性或食材状态的不确定性，用 warnings 提醒用户，不编造库存。无法给出负责任的做法时说明原因并停止，不为通过格式校验凑步骤。已有食品安全参考见 theme-assets.md；不把时间、颜色或成品图片当成安全证明，不编造“专业审校通过”。
3. 仅输出下列对象到完整包目录的 `.kitchen-bridge/cooking-<ticketId>.json`。字符串是数据，不能含执行命令、库存变更、已确认标记、生成的文化史或自动评分。菜名与 recipeId 必须原样返回。

```json
{
  "schemaVersion": "1.0",
  "recipeId": "从任务原样填写",
  "title": "从任务原样填写",
  "steps": ["准备步骤", "实际烹饪步骤", "完成与提醒"],
  "warnings": ["需用户核对的事项；没有可用空数组"]
}
```

上面只是格式说明，不是可直接提交的菜谱。每条步骤最多 800 字；warnings 最多 10 条，每条最多 300 字。

4. 用同一个 ticketId 提交真实生成文件：

```sh
node "/已确认的Skill目录/scripts/kitchen-bridge.mjs" cooking-submit --workspace "/已确认的完整工作台目录" --ticket "本轮ticketId" --file "/已确认的完整工作台目录/.kitchen-bridge/cooking-本轮ticketId.json"
```

5. 返回 pending 只能说“做法已交回，页面会自动接收，请回去核对步骤”，不能说已经开始做菜或扣库存。网页提交 IndexedDB 后才 ACK received；用户核对后才开始跟做，并保存本餐步骤快照。原固定配方链接只是参考，不是本次 AI 步骤的查证来源。

## 失败与隐私

同 ticket 与同文件重试幂等；不同内容被拒绝。取消、过期、重置或已拒绝任务不重用，也不提交给新的票据。请求仅包含本菜计划用料，不含整冰箱、个人照片或历史。收到回执/取消后，连接队列清除用料和步骤正文；Agent 写出的结果文件依旧是本机私人文件，不进入 Git 或分发包。不要把普通 HTTP/测试夹具成功称为 WorkBuddy 模型实测成功。
