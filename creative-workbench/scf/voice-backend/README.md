# 独立 SCF 云语音：维护者部署与验收

状态（2026-09-07）：代码与离线回归已准备；**本轮未创建云资源、未调用真实腾讯转写、未切换评委 ZIP 的地址**。旧 Sites 在浏览器中可用，不代表 ZIP Node 请求可用；之前的 HTML 403 仍须通过部署新入口和真实录音验收来解决。

普通评委不需要腾讯密钥、Whisper 或本机语音模型。评委仍通过 Mac / Windows 启动文件运行 ZIP 的 Node 中继，照片流程仍使用 WorkBuddy；此目录不改变照片、UI、菜谱或线上 Sites。

## 为什么修改原方案

- Function URL 事件不依赖 `isBase64Encoded`。本机到函数使用明确的 JSON `{ "audio": "<Base64 WAV>" }`；浏览器到本机仍传 `audio/wav`。最长 60 秒 WAV 为 1,920,044 字节，JSON 约 2.56 MB。
- 不再对单个计数 JSON 读改写。每个分钟、每日、全站名额分别是不可覆盖对象，使用 COS `x-cos-forbid-overwrite: true` 领取。只有明确创建成功才放行；只有 `409/FileAlreadyExists` 才尝试下一个名额，其他错误停止。
- 函数最大独占内存配额设置为 128 MB，函数内保留最多两个请求的内存护栏；**配额正确性依赖 COS 不可覆盖写入，不依赖“配额 1 就绝对串行”的假设**。
- 每次调用从 SCF `context` 取当前角色临时凭证，避免暖实例沿用过期令牌；不退回启动时的旧环境凭证。
- 部署工具默认离线。不会自动创建或扩权 CAM 角色，也不要求三个 `FullAccess` 策略。

## 1. 先准备公开配置和权限模板

在项目根目录运行（开发/部署工具需 Node 22.13+；云函数运行时为 Nodejs20.19）：

```bash
node scripts/deploy-voice-scf.mjs --check
```

默认无参数也只检查六个白名单代码文件，不读取 `.env`、不联网、不部署。

在根目录已忽略的 `.env` 中填写以下非密钥配置，桶名应使用你计划创建的专用桶完整名称：

```ini
VOICE_QUOTA_BUCKET=专用桶名称-你的APPID
VOICE_QUOTA_REGION=ap-guangzhou
SCF_OWNER_UIN=你的主账号UIN
SCF_ROLE_NAME=shisi-voice-scf-role
SCF_FUNCTION_NAME=shisi-voice-backend
KITCHEN_VOICE_DAILY_LIMIT=100
```

APPID 和主账号 UIN 是不同标识，不可互换。桶名后缀是 APPID。随后执行：

```bash
node scripts/deploy-voice-scf.mjs --plan
```

该模式读取配置，但不联网；只输出公开配置、角色信任策略、运行权限、部署权限和生命周期 XML，不输出任何密钥。环境变量优先于 `.env`。

## 2. 由账号管理员准备专用 COS 和运行角色

这一步会创建云资源，需要先确认授权和费用。

1. 创建同地域的**专用私有 COS 桶**，不要复用已有业务桶；禁止公开读写。该桶必须从未启用版本控制，`Suspended` 也不合格。已有版本桶应另建专用桶，不要靠关闭版本控制凑合。
2. 配置 `--plan` 输出的唯一生命周期规则：ID `voice-usage-expiration`、前缀精确为 `voice-usage/`、启用、创建 2 天后过期。不要添加其他提前删除规则。2 天表示进入清理条件，不保证恰好 48 小时内删除。
3. 创建专用 SCF 运行角色，使用输出的 `trustPolicy`，仅信任 `scf.qcloud.com`；只绑定一份输出的 `runtimePolicy` 自定义策略。权限是读取这个桶的版本/生命周期配置，以及向 `voice-usage/*` 执行 `PutObject`，没有删除对象、修改桶配置或管理 CAM 的权限。
4. 不要手动删除当天配额对象，也不要让其他程序写入或清理该前缀，否则会破坏上限。运行时会逐次检查版本控制和生命周期；异常时返回 503，不尝试修复权限或放行。

配置 XML 支持命名空间、标签间空白和子节点顺序差异，但前缀等叶子值须完全匹配，不能带多余空格。与模板不符时应检查实际配置，不要用更大权限绕过。

## 3. 分清两种凭证

**ASR 运行凭证**：继续使用仅有一句话识别权限的子账号，写入 `.env` 的 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。长期密钥不需要 `TENCENT_SESSION_TOKEN`，留空或不配置即可；仅使用临时 ASR 密钥时才提供配套令牌，并自行管理有效期。

**部署凭证**：另一个部署身份，只授予 `--plan` 输出的 `deploymentPolicy`，写入：

```ini
SCF_DEPLOY_SECRET_ID=
SCF_DEPLOY_SECRET_KEY=
# 仅临时部署凭证需要
SCF_DEPLOY_SESSION_TOKEN=
```

部署身份只读检查 CAM/COS 配置，创建或更新指定名称的 SCF，并传递已准备的运行角色。部分管理 API 只支持操作级授权，策略中相应操作的资源是 `*`；这不等同全权限，但也不应声称每项操作都被 IAM 限定到单个函数。建议使用专用部署身份，部署完成后禁用其部署密钥。

SCF 运行时访问 COS 的临时令牌由平台每次调用提供，**无需用户去寻找或手填**。两类用户凭证都不进入 Git、HTML、评委 ZIP、函数代码 ZIP 或日志；ASR 凭证仅通过部署 API 写入服务端环境配置。不要把密钥发聊天。

## 4. 明确同意费用后才部署

先在腾讯云检查 SCF、COS、ASR 的实际开通状态、套餐和告警。不要默认存在免费额度或每月零费用。每 IP 固定分钟窗口 5 次、UTC 每日 30 次、全站默认每日 100 次只限制 ASR 尝试；公网扫描、状态查询、COS 冲突写入等仍可能产生 SCF/COS 费用，并非账户消费硬封顶。

确认后由维护者执行：

```bash
node scripts/deploy-voice-scf.mjs --apply --accept-costs
```

工具先核对实际账号 APPID/UIN、角色策略、桶配置；随后创建/更新事件函数，等待每次变更进入 `Active`，核实内存配额，再创建公开 Function URL。不会创建旧 API 网关；不改线上 Sites。现有函数类型、角色、运行时或 URL 配置不符时停止，不会默默改造其他服务。

更新代码前先关闭语音；部署中断时可能保持关闭，核对错误后可重新执行。部署成功会输出真实 `origin`、`transport: "json-base64"` 和 `realRecordingVerified: false`。这只是 status 检查通过，**不是识别验收完成**。不要把完整云 API 响应/环境配置贴到聊天排错；工具仅输出脱敏错误分类。

## 5. 真实验收后再交付 ZIP

1. 用本机 Node 请求新地址的 `/api/voice/status`，确认 JSON `ready: true`。该检查验证配置可读，不验证 ASR 凭证实际有效。
2. 在待验收分支把 `skills/zhonghua-shisi/scripts/cloud-speech.mjs` 的 `VOICE_ENDPOINT` 改为部署返回的**确切 origin** 和 `transport: 'json-base64'`。不加尾斜杠，不把地址交给网页用户输入。默认地址在本轮尚未切换。
3. 经 ZIP 启动入口录制一段真实普通话，检查转写、取消、错误提示和确认前不入库。验证接近 60 秒录音，而非只用控制台空事件代替。
4. 在同一个固定分钟窗口，包含此前测试在内第六次有效尝试应被限额拒绝，且不再请求 ASR。用隔离验收配置测试每日/全站上限和多实例竞争；不要删除生产当天对象来重置次数。平台并发限制也可能产生 429，须区分应用限额 JSON 与平台拒绝。
5. 验证暖实例能够在平台临时凭证更新后继续读取 COS；验证 COS 不可用/版本配置异常时返回未就绪或 503，零额外 ASR 请求。
6. 分别在 Mac 和 Windows 真机解压，用对应启动文件完成录音和 WorkBuddy 照片流程。自动测试不代表 Windows 真机已经验收。
7. 运行全部测试、typecheck、lint、构建和 `npm run package:local`，检查 ZIP 不含 `.env` 或密钥；更新 `docs/CLOUD-VOICE.md` 的实际日期与验收证据后再提供评委。

Origin 和 `X-Kitchen-Voice` 校验不是用户登录认证；公网程序可自行构造它们。来自 Function URL 的平台来源 IP 才用于限额，不使用 `X-Forwarded-For`。同一 Wi-Fi 的评委可能共享 IP 上限。

配额对象键只有时间窗口、IP 的 HMAC 和名额编号，正文只有 `1`，不存音频、转写或明文 IP。部分名额领取后遇到限额/错误不会退还，可能保守地少放行；请求有 8 秒配额预算，COS 慢或冲突过多会返回 503，而不是超限继续识别。管理员变更桶配置、删除对象或变更 HMAC 密钥均须评估对配额的影响。

## 官方依据

- [Function URL 事件结构](https://intl.cloud.tencent.com/zh/document/product/583/69491)
- [SCF 运行环境](https://cloud.tencent.com/document/product/583/11060)、[角色临时凭证](https://cloud.tencent.com/document/product/583/9210/)
- [COS 不可覆盖写入及版本控制限制](https://cloud.tencent.com/document/product/436/7749)
- [COS 版本查询](https://cloud.tencent.com/document/product/436/19888)、[生命周期配置](https://cloud.tencent.com/document/product/436/8280)
- [SCF 授权操作](https://intl.cloud.tencent.com/zh/document/product/598/57149)、[COS 授权操作](https://intl.cloud.tencent.com/zh/document/product/598/57092)
- [CAM GetUserAppId](https://cloud.tencent.com/document/product/598/70416)
- [SCF 免费额度适用条件](https://cloud.tencent.com/document/product/583/73739)
