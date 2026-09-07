# 网页麦克风 · 腾讯云语音识别

## 当前状态

2026-09-07 13:16（北京时间）：**ZIP 独立腾讯 SCF 云语音已接通**。实际中继转写合成普通话成功；每分钟前 5 次成功、第 6 次返回应用 429。默认 ZIP 地址已切换为 `https://1482519311-ite8vah0bd.ap-guangzhou.tencentscf.com`，使用 JSON/Base64 WAV。资源、请求证据及未完成的真机检查见 [SCF 现场验收](SCF-VOICE-ACCEPTANCE.md)。这解决 ZIP 的独立入口，不代表旧 Sites 403 已消失。

已实现云端接口、录音格式转换、候选确认、错误回退和持久化用量限制。
2026-09-07 已配置线上凭证并实测腾讯云接口，用户反馈线上录音识别正常；其他设备仍需按下方清单验收。不能把模拟接口测试视为所有浏览器均已实测。

公网 HTTPS 页面使用 `/api/voice/status` 和 `/api/voice/transcribe`，不要求
WorkBuddy、Node、Python 或本地语音模型。新版 ZIP 的 `127.0.0.1:43117` 且含
工作区标记的入口通过本机 Node `/voice/*` 中继至独立 SCF 的 `/api/voice/*`。
两种入口均按云端语音进行 WAV 转换、录音时长限制与隐私说明；没有本机模型回退。
单独双击 HTML 没有连接程序，语音入口提示使用启动文件或 HTTPS 站点，仍可直接输入文字。

ZIP 照片仍用 WorkBuddy，不需要 TokenHub 密钥。H5 的直接照片 API 是另一条路线，当前尚未配置 TokenHub 视觉密钥，不能称为 H5 全功能已启用。本次不伪装浏览器、不拷贝登录 Cookie、不将密钥打包，也不改回下载本机模型。

### 历史：旧 Sites 入口 403 排查（独立 SCF 已接替 ZIP 路径）

- 当前 ZIP 的 Node 中继是 `fab05dd` 新增路径；此前浏览器直接请求线上 API 的成功记录，不能证明中继已通。服务端语音代码自 `041befd` 后未变。
- 本机对固定 `/api/voice/status` 的请求收到 HTTP 403、`server: cloudflare`、`content-type: text/html`，页面标题为 `Attention Required! | Cloudflare`；排查编号为 `a3725f3b9b0f5cfd-LAX`。没有上传录音或调用付费转写。
- 应用的 status 处理器始终返回 JSON / 200；应用自身的 POST 校验失败是 JSON / 403。因此这次 HTML 拒绝发生在应用处理器之外，不能归因为腾讯密钥、语音额度或录音格式。
- Sites 查询确认站点为 active / public。最近两小时的 Worker 日志有浏览器首页 GET / 200，没有此次 status 请求记录；日志查询不能代替平台防护事件查询。
- 此 Mac 的系统 HTTP/HTTPS 代理已开启，但 Node 22.14.0 的默认 fetch 不读取这份配置。这说明两者可能采用不同网络路径，**尚未证明其与 403 的因果关系**；未切换代理、伪装客户端、复制 Cookie 或尝试绕过 403。
- 中继现在区分 Cloudflare HTML 403 与普通/API 403，只显示经过长度和字符校验的请求编号；不读取或显示上游错误正文，不自动重试。

若未来希望 Node 再直接使用旧 Sites，须由托管平台管理员凭请求编号查询防护规则；现有 Sites 管理接口没有该层规则管理能力。不可因 public 已开启就宣称 Node 客户端可用。当前采用用户已授权的独立 SCF API，密钥仍在服务端，保留持久化限额。

独立 SCF 已通过状态、合成语音真实转写和限额验收；浏览器真实录音及 Mac / Windows 解压后的现场流程仍需分别验证。

依据：[Cloudflare 403 排障说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-403/)、[Node 官方代理配置说明](https://nodejs.org/en/learn/http/enterprise-network-configuration)。

### 独立 SCF（2026-09-07，已部署并通过云端验收）

针对 ZIP 的程序化访问准备了独立 SCF Function URL 后端，详见
[维护者部署与验收](../scf/voice-backend/README.md)。这不修改现有 Sites 服务，也没有证明旧站点的 403 已消失。

- 本机中继支持明确的 JSON/Base64 WAV 传输，已自动测试 60 秒音频逐字节往返；默认目标已切换为上述实际验收的 SCF 入口。
- COS 不再采用单 JSON 计数覆盖写入；改为三个限额窗口的不可覆盖名额对象，跨实例竞争与不确定写入均按不放行处理。每次调用检查专用桶从未开启版本控制及指定的 2 天生命周期规则。
- COS 访问逐次解析 SCF `context.environment` 的角色临时凭证，不缓存冷启动时的旧令牌；现场发现并修正了原顶层读取错误。
- 部署脚本默认离线 `--check`；`--plan` 仅输出限定权限模板；只有 `--apply --accept-costs` 才会部署。COS 桶、生命周期和专用运行角色需由管理员事先准备，不自动授予三套全权限。
- 专用私有桶、生命周期、最小权限运行角色及函数 URL 均已部署；真实腾讯 ASR 调用成功。没有进行 Windows 真机验收；合成语音测试不能冒充真实麦克风验收。
- 离线验收：`npm test` 共 281 项通过，typecheck、lint:app、Web 构建与单文件 HTML 构建通过；SCF 六文件白名单包可独立加载。客户端 12 个产物未匹配本机已配置的实际密钥，也未发现 TC3 签名实现或服务端密钥变量名；通用 AKID 模式的一处命中已确认位于图片 Base64 内。构建仍有大资源包体积警告，不影响本次通过状态。

## Sites 服务端配置（维护者一次设置，普通用户不用设置）

1. 在腾讯云开通语音识别，确认计费/额度；使用仅有一句话识别调用权限的凭证。
2. 本地调试把凭证填入项目根目录 `.env`（已被 Git 忽略）：
   `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`；仅临时凭证需额外填
   `TENCENT_SESSION_TOKEN`。不要把密钥发聊天，不使用 `VITE_` / `NEXT_PUBLIC_` 前缀。
3. 在 Sites 服务端环境配置同名变量，凭证标记为 secret。将
   `KITCHEN_VOICE_ENABLED` 设为 `1`，确认 `KITCHEN_VOICE_DAILY_LIMIT`。
   本机 `.env` 不会自动上传到 Sites，环境更新后需要发布新版才能生效。
4. `.openai/hosting.json` 声明 D1 绑定 `VOICE_LIMITS`；Sites 部署时创建绑定并应用
   `drizzle/0000_voice_usage_limits.sql`。本地开发需先对本地 D1 应用该迁移，
   不要手动在 API 启动时建表。该 D1 要求针对 Sites/Worker 路径；独立 SCF 使用上文的 COS 持久化名额方案，不能省略限额存储。
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
不存明文 IP、转写文字、食材或照片。独立 SCF 的 COS 对象仅记录时间窗口、HMAC 后的 IP 和名额编号，正文为 `1`；专用生命周期设置为对象创建 2 天后进入清理条件，不保证恰好 48 小时删除。厨房库存仍在原浏览器中，本改动不增加云同步。

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
