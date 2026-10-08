# GitHub 连接器（@local/dsh-plugin-github）

给 DeepSeek Harness 增加四个**只读** GitHub 工具，用 Personal Access Token（PAT）认证。
所有请求都是 `GET`，插件只读取，不修改 GitHub 上的任何内容。

---

## English

**Read-only GitHub tools for DeepSeek Harness**, authenticated with a Personal Access Token. Every request is a `GET`: the plugin only reads, and never modifies anything on GitHub.

| Tool | Purpose |
|---|---|
| `github_api` | Generic read-only entry point — any `GET` path plus query values, returning the status and the JSON or text body |
| `github_search` | Search repositories, code, issues or users, projected into a compact list |
| `github_file` | Read one file's UTF-8 content from a repository, or list a directory |
| `github_issues` | List a repository's issues or pull requests (state, labels, limit) |

**Install** — ask your DSH agent, then reload the page once:

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
```

**Configure the token** — open **Settings → GitHub**, paste a Personal Access Token and press *Test and save*. The page verifies the token against `api.github.com` first and stores it only once GitHub accepts it, so a rejected token is never saved. No restart needed.

Alternatively, write the credential file directly (it is hot-reloaded too):

```yaml
# %USERPROFILE%\.dsh\.credentials.yaml      (or <DSH_HOME>/.credentials.yaml)
version: 1
refs:
  GITHUB_TOKEN: ghp_your_token
```

The token never appears in the plugin's own configuration — that holds only the *reference name*. Scopes: default permissions are enough for public data; private repositories need the classic `repo` scope, or a fine-grained token with `Contents: Read`, `Issues: Read`, `Pull requests: Read`, `Metadata: Read`. Note that unauthenticated access to a private repository returns **404 rather than 403**, so a 404 usually means the token is missing or under-scoped.

**Use** — just ask the agent:

- *"Use `github_api` on `/rate_limit`"* — confirm the token works and see the remaining quota
- *"`github_search` for `language:rust stars:>5000` repositories"*
- *"`github_file` read `owner/repo` at `src/index.ts`"*
- *"`github_issues` list `owner/repo` open pull requests"*

**Compatibility.** Built and verified against DSH `0.2.0-rc.2`. The rest of this document is in Chinese and goes deeper: the settings page internals, every configuration field, and the author's local network notes.

---

## 快速上手

1. **装**：把这条规格发给你的 DSH agent（插件由 agent 安装，用户不直接调用 `plugin_manager`）：

   ```
   plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
   ```

   返回 `"application": "applied"` 即成功。然后**刷新一次页面**。

2. **配令牌**：打开 **设置 → GitHub**，粘贴 PAT，点「测试并保存」。页面会先拿令牌去 GitHub 验证，
   通过后才写入凭据存储（免重启）。细节见 [配置令牌](#配置令牌必做)。

3. **用**：直接让 agent 去查就行，例如

   - 「用 `github_api` 看 `/rate_limit`」——确认令牌生效、还剩多少配额
   - 「`github_search` 搜 `language:rust stars:>5000` 的仓库」
   - 「`github_file` 读 `owner/repo` 的 `src/index.ts`」
   - 「`github_issues` 列 `owner/repo` 现在开着的 PR」

四个工具的参数见下一节。装上之后**不需要重启 DSH**。

## 工具

| 工具 | 作用 |
|---|---|
| `github_api` | 通用只读入口：任意 `GET /…` 路径 + 查询参数，返回状态码与 JSON/文本正文 |
| `github_search` | 搜索仓库 / 代码 / Issue / 用户，结果投影成紧凑列表 |
| `github_file` | 读取仓库中某个文件的 UTF-8 内容；路径是目录时列出目录项 |
| `github_issues` | 列出某个仓库的 Issue 或 PR（支持 state、labels、数量上限） |

典型用法：

- `github_api` → `/user` 验证令牌；`/repos/{owner}/{repo}` 看仓库信息；`/rate_limit` 看配额
- `github_search` → `query: "language:typescript stars:>500"`, `kind: "repositories"`
- `github_file` → `owner/repo` + `path: "src/index.ts"` + 可选 `ref: "v1.2.0"`
- `github_issues` → `kind: "pulls"`, `state: "open"`

## 配置令牌（必做）

**推荐：设置 → GitHub 页**（下一节有详细说明）。粘贴令牌、点「测试并保存」——它会先拿令牌去
GitHub 验证，通过后才写进凭据存储，**免重启**；被拒绝的令牌不会被保存。

**备选：直接写凭据文件**（同样免重启，该文件被监听并热重载）：

- Windows：`%USERPROFILE%\.dsh\.credentials.yaml`
- 其他平台：`<DSH_HOME>/.credentials.yaml`

```yaml
version: 1
refs:
  GITHUB_TOKEN: ghp_你的令牌
```

令牌**不出现在插件的配置里**——配置只保存「引用名」（默认 `GITHUB_TOKEN`）。解析优先级由 DSH 凭据服务决定：
**启动环境 > 凭据存储文件 > 项目 `.env` > harness home 的 `.env`**。插件按 `tokenEnv` → `GITHUB_TOKEN`
→ `GH_TOKEN` 的顺序解析，都没找到时直接报错并说明去哪里配，不会发出未认证请求。

后两种方式（进程环境变量 / `.env` 文件）需要**重启 DSH**：启动环境是启动瞬间的快照，运行中新增或修改都读不到（已实测）。

**PAT 权限**：读公开数据用默认权限即可；读私有仓库需要 classic 令牌的 `repo` 范围，或细粒度令牌的
`Contents: Read`、`Issues: Read`、`Pull requests: Read`、`Metadata: Read`。
**注意**：未认证访问私有仓库时 GitHub 返回的是 `404` 而不是 `403`，所以「404」通常意味着令牌没配上或权限不足。

## 在界面里操作（设置 → GitHub）

插件带一个浏览器半边，在**设置**面板里新增一页 **GitHub**（导航顺序 25，排在 General / Models / Plugins / Agent presets 之后）。

页面提供三件事：

- **令牌状态** —— 显示 `GITHUB_TOKEN` 当前是「已配置」还是「未配置」。状态来自 Host 的凭据域
  （`ctx.remote.credentials.describe`），它**只回答是否已配置，永不返回令牌值**。
- **测试并保存** —— 先把输入的令牌发往 `api.github.com/user` 验证，通过后才写入凭据存储，
  并当场显示登录账号、权限范围与配额。GitHub 的 API 放行 CORS（`Access-Control-Allow-Origin: *`）
  且暴露 `X-OAuth-Scopes` / `X-RateLimit-*`，所以这一步能在浏览器里真实验证。
  **被拒绝的令牌不会被存储**，字段只在保存成功后清空。
- **移除令牌** —— 调用 `ctx.remote.credentials.unset`，之后工具会报缺少令牌。

实现要点：

- 注册进 `settings.section` 槽位，注册项只用 `{ id, order, label }`，不假设其它注册选项；
  组件通过闭包拿到 `ctx` 与 `t`，宿主改注册契约也不影响。
- 只 `require('react')`，**不 import 任何 Harness Client 包**（规范明确要求），控件与样式自己写。
- 配色全部走主题令牌（`--dsw-alias-*`），样式块随组件挂载与卸载。
- 文案走 `ctx.locale`，注册 `settings.github` 命名空间，中英各一份。
- 监听 `credentials/reference-updated`：令牌若从别处被改动，页面上的状态会跟着刷新。

注意：这一页验证的是**令牌本身**。Agent 工具能否访问 GitHub，还取决于 Host 进程是否信任你网络的证书 —— 见下一节。

## 只在本机需要时的两项配置（默认都不用配）

插件包自带的 `cordis.patch.yml` **刻意不含任何本机路径**：bundle patch 会应用到每个安装它的
profile，一条绝对路径或一份本机证书会跟着跑到别人机器上。所以下面两项都默认关闭，需要时写到
**你自己 profile 的 patch 层**——`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`，它的优先级高于所有
bundle 层，而且不会被发布出去：

```yaml
- id: github-connector
  config:
    caFile: /绝对/路径/your-ca.pem     # 只有走 TLS 中间人代理时才需要
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.', '/你的插件目录/github-connector']   # 只有改源码要热重载时才需要
```

### `caFile`：网络走 TLS 中间人代理时才需要

如果你的网络把 `github.com` / `api.github.com` 在 hosts 里指向 `127.0.0.1`，由某个本地加速器
（例如 **Steam++.Accelerator / 瓦特工具箱**）在 443 端口做 TLS 中间人加速，那么 Windows 信任它的证书、
但 **Node 只用自带根证书库**，`fetch` 会直接失败：

```
TypeError: fetch failed — UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

判断方法：`Resolve-DnsName api.github.com` 返回 `127.0.0.1` 就是这种环境。

这时把加速器的 CA 导出成 PEM，配上 `caFile`（绝对路径）。插件激活时会把这枚 CA 追加到本进程的
默认信任列表（等价于 `NODE_EXTRA_CA_CERTS`），幂等，热重载不会重复追加。也可以用环境变量替代：
启动 DSH 前设 `NODE_EXTRA_CA_CERTS=<你的 PEM>`。

- **普通直连网络：什么都不用配。**
- 指向不存在的文件不会让插件崩溃：加载时记一条警告，随后请求会因证书不受信而失败。
- 副作用说明：这枚 CA 会被本进程的所有 TLS 连接信任，而不只是 GitHub 请求。

### `hmr.root`：只有改这个插件的源码时才需要

加上你放置该插件的绝对路径即可让改动热重载，而不是每次重启进程。

## 配置项

在 **profile 层**（`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`）按 `id: github-connector` 覆盖。
装到多个 profile 时每处各自生效；不要改本包自带的 `cordis.patch.yml`——那会跟着发布出去。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `tokenEnv` | `GITHUB_TOKEN` | 保存 PAT 的凭据引用名 |
| `apiBaseUrl` | `https://api.github.com` | GitHub Enterprise 改成 `https://<host>/api/v3` |
| `timeoutMs` | `30000` | 单次请求超时（毫秒） |
| `maxOutputChars` | `60000` | 单次结果返回给模型的字符上限 |
| `caFile` | 不设（不追加） | 额外信任的 PEM 证书文件；只在网络走 TLS 中间人代理时需要。相对路径基于插件目录，建议写绝对路径 |

## 安装与卸载

**别人安装**（不需要克隆、不需要 npm）：

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
```

想锁版本就把 ref 放在 `#` 后、`&path:` 前，例如 `#v1.0.0&path:/github-connector`
（**必须用完整 40 位 SHA**；`#path:…&tag=…` 这种写法无效）。

**本地开发安装**（作者本机就是这样，pnpm 记录为 `link:F:/插件/github-connector`）：

- 首次安装：`plugin_manager { action: "install_bundle", target: "F:\\插件\\github-connector" }`
- 修改代码或配置后重新生效：`set_plugin` 目标填入口 id `include:github-connector`，先 `enabled: false` 再 `enabled: true`
  （用 `install_bundle` 重复安装同一路径会报 `ambiguous-install`：包已存在、依赖未变化，工具无法唯一定位。）
- 卸载：`remove_bundle`，目标填 `@local/dsh-plugin-github`

> 装完**刷新一次页面**：Host 侧是热应用的，但浏览器侧（设置里的 GitHub 页）要重新加载才会出现。

## 设计说明

- **零第三方依赖**：`index.js` 只 import `node:` 内置模块（`node:fs`、`node:path`、`node:tls`、`node:url`），
  不 import 任何 DSH 包或 npm 包。因为 profile 用 `link:` 引用本地目录，Node 会按真实路径
  `F:\插件\github-connector` 解析裸模块名，那里没有 `node_modules`，任何 `@deepseek-ai/*` 的 import 都会加载失败。
- **只用 GET**：工具没有 method 参数；需要写操作时得另做一个插件。
- **令牌不外泄到其他主机**：`path` 若写成完整 URL，必须与 `apiBaseUrl` 同源，否则拒绝。
- **超时与取消**：`AbortSignal.timeout(timeoutMs)` 与工具调用的取消信号合并。
- **输出裁剪**：超过 `maxOutputChars` 会截断并附带可恢复提示（改用 `per_page`、更精确的路径或查询）。
- **错误可读**：401/403/404 会带上 GitHub 的 `message` 与针对性提示（配额用尽、权限不足、私有仓库不可见）。

## 开发测试

安装与运行**不需要**测试文件。作者工作区里另有两套无头测试（不在本包内），用来在没有浏览器控制的环境下验证行为：

- **Host 半边** —— 用真实 `fetch` 桩驱动四个工具与全部错误路径，并用官方 `assertSupportedJsonSchema`
  校验工具与参数 schema，另验证 `caFile` 注入的幂等性与失败可见性，共 18 条断言。
- **Client 半边** —— 用**真实的 `react` 包**（`createElement` 是真的）加一个极小的 hooks 运行时，
  把设置页真正渲染成元素树，再点真正的按钮：覆盖槽位注册契约、页面结构、主题令牌使用、
  令牌验证与保存、401 拒绝时不落盘、网络失败、空输入、移除令牌，以及来自 Host 的凭据变更通知。

两者都依赖 DSH 安装目录里的 `@deepseek-ai/dsh-tools` 与 `react`，移植时需按实际路径调整解析基准。

## 迭代：改代码后如何生效

本包的 `cordis.patch.yml` 里有一条针对 `hmr` 条目的覆盖，把插件目录加进了 HMR 的模块监听根：

```yaml
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.', 'F:/插件/github-connector']
```

HMR 内部是 `watch(root, { cwd: watchBaseDir })`；文件变化会命中 Loader 里的 include 并执行
`include.refresh()`，即重新加载该模块代次。加上默认约 2 秒的 `awaitWriteFinish` 稳定窗口，
保存后大约 2 秒生效，**不需要重启**。这条配置是机器相关的（写死了本地绝对路径），
包被挪走或不需要热重载时删掉即可。

前提：`root` 是**启动时**读取的，所以这条配置本身也要等一次重启才生效。

这条通道只覆盖 **Host 半边**（`index.js`）。**Client 半边**（`client.js`）由浏览器加载，
改完**刷新页面**即可；但它的模块图随 profile 组合生成，所以首次加入 `client.js`、
或改动包的 `exports` / `dsh.client` 声明时，仍要先重启一次让宿主重新组合。

### 需要重启时

这个应用默认「关闭窗口 → 缩到托盘」，点窗口右上角的 ✕ **不会**结束进程。正确做法是托盘图标右键 → 退出，
或在**普通的** PowerShell 窗口里（不能在 DSH 自带终端里）执行：

```powershell
Get-Process "DeepSeek Harness" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process "DeepSeek Harness.exe"   # 或从开始菜单打开
```

> 从 DSH 自己的 shell 里派生独立进程行不通 —— 沙箱会立刻杀掉它们（WMI 创建、父进程挂在系统服务上的
> 那种也一样，实测两次），所以重启只能从外部发起。

## 验证状态

全部通过 —— 在这台机器上从安装到界面都是实测的，没有靠推断。

**Host 半边**

- 安装 `application: applied`；`cordis_inspect_query` 确认四个工具对模型可见 ✅
- **端到端可用**：`github_api` → `/repos/hh719509125/deepseek_harness_plugin` 返回 **HTTP 200**
  （真实令牌 + `caFile` 生效后的真实请求）✅
- CA 注入实测：注入前 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，注入后 **200** ✅
- 令牌链路：凭据存储解析正常；旧令牌吊销后实测返回 `401 Bad credentials` ✅
- 18 条桩请求 + 官方 `assertSupportedJsonSchema` 校验 + `caFile` 幂等与失败可见性断言，全部通过 ✅
- `hh719509125/Skills` 未认证访问返回 `404`，说明它是私有仓库，需要 PAT ✅
- git over SSH（443）已打通：`ssh -T` 认证成功，`git ls-remote` 能读到私有仓库的 `main` 分支 ✅
- PAT 已写入凭据存储并单独校验有效：`login=hh719509125`，scope `[repo]`，认证配额 4999 ✅
- 插件的凭据解析链路已验证：工具能取到令牌（取不到时会报 “no GitHub token found”，实际未报） ✅
- 设置页（Client 半边）已通过无头渲染测试：注册契约、页面结构、主题令牌、令牌验证与保存、
  401 不落盘、网络失败、空输入、移除令牌、凭据变更通知，全部断言通过 ✅
- 浏览器直连 GitHub 的可行性已实测：预检返回 `204` 且 `Access-Control-Allow-Origin: *`，
  带令牌的 `GET /user` 返回 `200` 并暴露 `X-OAuth-Scopes: repo`、`X-RateLimit-Limit: 5000` ✅

**Client 半边**

- 设置 → **GitHub** 页已在界面上渲染出来（令牌「已配置」徽章、引用名 `GITHUB_TOKEN`、输入框、两个按钮）✅
- 无头渲染测试覆盖：槽位注册契约、页面结构、主题令牌、令牌验证与保存、401 不落盘、网络失败、
  空输入、移除令牌、来自 Host 的凭据变更通知 ✅
- 浏览器直连 GitHub：预检 `204` + `Access-Control-Allow-Origin: *`，带令牌 `GET /user` 返回 `200`
  并暴露 `X-OAuth-Scopes: repo`、`X-RateLimit-Limit: 5000` ✅
- 修复记录：主按钮曾因 `--dsw-alias-brand-primary` 配硬编码 `#fff` 而呈现白底白字（该令牌在浅色主题下取值极浅）。
  已改用宿主 `Button` 原语的**成对令牌**（`--dsw-alias-button-primary-fill` / `--dsw-alias-label-primary-foreground`），
  并加了一条回归断言；页面样式现在不含任何硬编码颜色 ✅

**git 侧**

- SSH over 443 打通：`ssh -T` 认证成功，`git ls-remote` 可读私有仓库与目标仓库 ✅

---

## 附录：作者本机环境记录

> 这一节只描述**作者本机**的网络与工具链，与插件的普通使用者无关，可以整段跳过。

22 端口在本网络被封，且 hosts 把 `github.com` 指向 `127.0.0.1`，所以 git 走 SSH 默认端口必然连到本机而失败。
已生成一把 ed25519 密钥，并让 SSH 改走 GitHub 的 443 备用入口：

- 私钥：`%USERPROFILE%\.ssh\id_ed25519`（**无口令**，便于免交互；需要更安全时可加口令并配 ssh-agent）
- `~/.ssh/config`：`Host github.com` → `HostName ssh.github.com` / `Port 443` / `IdentityFile ~/.ssh/id_ed25519`
  （`HostName` 会覆盖解析目标，因此同时绕开 22 端口封锁和 hosts 劫持）
- 公钥指纹 `SHA256:bkSQYIEYm1lOKYQwuOC+hjBsufHypBkmuLbzwvM0YtE`，已添加到 GitHub

**SSH key 与 PAT 不能互换**：`api.github.com` 是 HTTPS REST 接口，只接受 token；
SSH key 只在 git 的 SSH 传输层生效。所以这套配置解决的是 clone/pull/push，插件仍需 PAT（见上文「配置令牌」）。
