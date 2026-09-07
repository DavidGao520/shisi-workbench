# 网页麦克风 · 腾讯云语音识别

## 当前状态

已实现云端接口、录音格式转换、候选确认、错误回退和持久化用量限制。
2026-09-07 已配置线上凭证并实测腾讯云接口，用户反馈线上录音识别正常；其他设备仍需按下方清单验收。不能把模拟接口测试视为所有浏览器均已实测。

公网 HTTPS 页面使用 `/api/voice/status` 和 `/api/voice/transcribe`，不要求
WorkBuddy、Node、Python 或本地语音模型。新版 ZIP 的 `127.0.0.1:43117` 且含
工作区标记的入口通过本机 Node `/voice/*` 中继至同一云端 `/api/voice/*`。
两种入口均按云端语音进行 WAV 转换、录音时长限制与隐私说明；没有本机模型回退。
单独双击 HTML 没有连接程序，语音入口提示使用启动文件或 HTTPS 站点，仍可直接输入文字。

2026-09-07 ZIP 路径验收：云端连接代码已改接现有 API，照片仍用 WorkBuddy。
本机 Node 请求现有站点 `/api/voice/status` 返回 Cloudflare 403 拦截；Sites 站点访问权限已核实为 public。
因此尚不能宣称 ZIP 云语音已实测接通，须由维护者解决受支持的 API 访问入口后补做端到端验收。
不通过伪装浏览器、拷贝登录 Cookie 或将密钥打包来绕过拦截，也不改回下载本机模型。

## 服务端配置（维护者一次设置，普通用户不用设置）

1. 在腾讯云开通语音识别，确认计费/额度；使用仅有一句话识别调用权限的凭证。
2. 本地调试把凭证填入项目根目录 `.env`（已被 Git 忽略）：
   `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`；仅临时凭证需额外填
   `TENCENT_SESSION_TOKEN`。不要把密钥发聊天，不使用 `VITE_` / `NEXT_PUBLIC_` 前缀。
3. 在 Sites 服务端环境配置同名变量，凭证标记为 secret。将
   `KITCHEN_VOICE_ENABLED` 设为 `1`，确认 `KITCHEN_VOICE_DAILY_LIMIT`。
   本机 `.env` 不会自动上传到 Sites，环境更新后需要发布新版才能生效。
4. `.openai/hosting.json` 声明 D1 绑定 `VOICE_LIMITS`；Sites 部署时创建绑定并应用
   `drizzle/0000_voice_usage_limits.sql`。本地开发需先对本地 D1 应用该迁移，
   不要手动在 API 启动时建表。独立托管同样必须提供 D1 绑定及迁移。
5. 凭证、数据库或开关不完整时返回未开通/503，不上传录音、不调用付费识别。
   腾讯返回认证/服务未开通错误时也不会当成成功。

默认全站每天最多 **100 次** 识别尝试（UTC 日界，允许配置 1–1000）；
每个来源 IP 每分钟 5 次、每天 30 次。D1 条件 UPSERT 在多实例间共享上限，
不是内存计数；另限制每个 Worker 实例最多同时处理两段录音以保护内存。失败调用也消耗次数，不自动重试付费请求。不同用户共用网络时
会共享该 IP 限额。此计数上限不是腾讯云账户级消费封顶，仍应配置供应商侧告警。

仅接受同源 POST、固定自定义请求头及 Cloudflare 提供的来源 IP；
不接受客户端指定的识别地址、音频 URL、模型、密钥或时长。
同源检查不是用户认证，公网访客依然受持久化的总量限额约束。
`X-Forwarded-For` 不参与计费限额；localhost 调试使用固定本地标识。

## 数据流与隐私

浏览器 MediaRecorder 录音 → OfflineAudioContext 解码/16 kHz 重采样 →
单声道 PCM16 WAV → 工作台服务端签名 → 腾讯云 SentenceRecognition →
文字 → 原有食材词典/数量规则 → 可编辑候选 → 用户确认 → 当前浏览器 IndexedDB。

浏览器最长录制 55 秒，为编码尾部留余量；服务端只接受至多 60 秒的规范 WAV
（最大 1,920,044 字节，Base64 后小于腾讯 3 MB 上限）。不是把 WebM/MP4 改名为 WAV。
录音时、等待麦克风授权、解码或上传中取消/关闭都会阻止旧结果进入当前清单。
上传已被腾讯受理后取消，不保证供应商不计费。

工作台不保存音频、不在日志写录音或转写内容。腾讯云会接收音频以提供转写；
其数据处理适用腾讯云服务条款，不能宣称“不上传第三方”或替供应商保证零留存。
D1 只存调用次数、重置时间和密钥 HMAC 后的 IP 标识，过期计数惰性清理；
不存明文 IP、转写文字、食材或照片。厨房库存仍在原浏览器中，本改动不增加云同步。

## 验证与发布门槛

- `npm test`、`npm run typecheck`、`npm run lint:app`、`npm run build`、`npm run build:html`。
- 自动测试包括真实 WAV 编码/校验、独立 TC3 签名比对、SQLite 原子配额、
  错误/取消/格式/大小边界及确认前不入库。模拟的云响应和浏览器解码器并非实测语音。
- 配置凭证后必须实际测试：电脑 Chrome 和手机 Safari 各说一段普通话，
  确认文字、数量、可取消、关闭后麦克风释放、仅点击确认才入库。
- 发布前检查客户端静态产物无 `TENCENT_SECRET_KEY` / TC3 签名实现。
- 不会因配置未完成就把模拟转写或本机 Whisper 冒充云端结果。

## 官方接口依据

- [腾讯云一句话识别](https://cloud.tencent.com/document/api/1093/35646)
- [腾讯官方 SDK 参数定义](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/asr/v20190614/asr_models.ts)
- [腾讯云签名方法 v3](https://cloud.tencent.com/document/product/1278/46716)
- [Web Audio decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)

固定接口为 `https://asr.tencentcloudapi.com/`，Action `SentenceRecognition`，
Version `2019-06-14`，引擎 `16k_zh`；`DataLen` 是 Base64 前的实际字节数。
HTTP 200 也必须检查 `Response.Error`。
