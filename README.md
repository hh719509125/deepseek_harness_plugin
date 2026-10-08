# DeepSeek Harness Plugins

**English** · [中文说明](#中文说明)

Plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Each plugin is a self-contained DSH bundle — a plain directory whose `package.json` declares the composition rows it inserts through `dsh.bundle.patch`. Installing one needs **no npm publish and no manual profile editing**.

| Plugin | Where it lives | What it does |
|---|---|---|
| [`github-connector/`](github-connector/) | this repository | **Read-only GitHub tools** — `github_api`, `github_search`, `github_file`, `github_issues` — authenticated with a Personal Access Token, plus a token settings page. |
| **Preview Editor** | **[hh719509125/dsh-preview-editor](https://github.com/hh719509125/dsh-preview-editor)** | **Edit text documents in place** in the Sidebar document preview — save/revert, `Ctrl+S`, conflict protection, byte-exact line-ending preservation. It grew its own repository so it can be found, starred and installed on its own. |

## Install

Ask your DSH agent to install straight from GitHub — nothing is published to npm and nothing is cloned by hand:

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
plugin_manager { action: "install_bundle", target: "github:hh719509125/dsh-preview-editor" }
```

`#path:/<subdirectory>` is pnpm's git-subdirectory spec, so the collection repository can hold more than one package; the preview editor is its own repository, so its spec needs no path at all. `"application": "applied"` means it took — then **reload the page once**, because the browser half loads with the page.

**Pin a version.** Put the ref in the position each spec form expects:

| Plugin | Spec |
|---|---|
| github-connector | `…#v1.0.0&path:/github-connector` — ref before `&path:` |
| preview editor | `github:hh719509125/dsh-preview-editor#v1.0.0` — ref after `#` |

Either way the ref must be a branch, a tag, or a **full 40-character commit SHA** — an abbreviated one does not resolve, because `git ls-remote` never returns one.

**Permission.** Every `plugin_manager` action needs `danger-full-access` or a per-call approval. Installed Host code runs in-process as your user, outside the workspace sandbox — the same trust level as running bash inside Harness. Read the source before installing.

Usage, configuration and limitations live in each plugin's own `README.md`.

## Compatibility

Both plugins are built and verified against **DeepSeek Harness `0.2.0-rc.2`**, and both lean on internal DSH contracts — the preview editor on Connection's exact `/api` Fetch route and the preview's `documentPreviews` renderer registry, the connector on the `ctx.tools` registry. These are not promised to be stable across release candidates. Neither plugin declares `peerDependencies` on purpose: the official packages peer on `@deepseek-ai/cordis`, and a wrong range makes the plugin manager **refuse the install up front**, which is harder to diagnose than a runtime error. If a tool or renderer does not show up, check the DSH version first.

## Layout

```
.
├── .gitattributes          # stored as LF
├── .gitignore
├── LICENSE                 # MIT, covers the whole repository
└── github-connector/       # one complete plugin package
```

Each plugin directory is self-contained — `package.json`, Host half, Client half, `cordis.patch.yml`, locale files, icon, and its own `LICENSE` — so a directory copied on its own still installs.

---

## 中文说明

给 DeepSeek Harness（DSH）用的插件集合。每个插件都是一个**独立、可单独安装**的 DSH 组合包（bundle）：一个普通目录，靠 `package.json` 里的 `dsh.bundle.patch` 声明要插入的组合行。**不需要发布到 npm，也不用手改 profile 的 `package.json`。**

| 插件 | 位置 | 作用 |
|---|---|---|
| [`github-connector/`](github-connector/) | 本仓库 | 用 Personal Access Token **只读**访问 GitHub：`github_api`、`github_search`、`github_file`、`github_issues` 四个工具，以及一个令牌设置页 |
| **文档编辑** | **[hh719509125/dsh-preview-editor](https://github.com/hh719509125/dsh-preview-editor)** | 在右侧栏的文档预览里**直接编辑文本文件**：保存/撤销、Ctrl+S、冲突保护、行尾逐字节保留。它已经**独立成一个仓库**，方便被单独搜到、收藏和安装 |

### 快速上手

前提：DSH 已经装好、能打开界面。

1. **装** —— 把下面这条规格发给你的 DSH agent（插件由 agent 安装，用户不直接调用 `plugin_manager`）：

   ```
   plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
   ```

   想装文档编辑插件，用 `github:hh719509125/dsh-preview-editor`。返回 `"application": "applied"` 即成功。

2. **刷新一次页面** —— 安装对 Host 是热生效的，但浏览器侧要重新加载一次才会出现插件贡献的界面。

3. **用**：

   | 插件 | 装完怎么用 |
   |---|---|
   | GitHub 连接器 | **设置 → GitHub** 页粘贴 Personal Access Token，点「测试并保存」；之后直接让 agent 用它查 GitHub |
   | 文档编辑 | 右侧栏按 `Ctrl+P` 打开文件树，点一个 `.txt` / 代码 / `.json` 文件 → **打开就是编辑器**，改完 `Ctrl+S` |

   细节、配置项和边界都在各插件自己的 `README.md` 里。

### 安装

插件由 **agent** 安装（`plugin_manager` 是 agent 工具，用户不直接调用）。

| 插件 | 安装规格 |
|---|---|
| GitHub 连接器 | `github:hh719509125/deepseek_harness_plugin#path:/github-connector` |
| 文档编辑 | `github:hh719509125/dsh-preview-editor` |

`#path:/<子目录>` 是 pnpm 的 git 子目录规格，所以本仓库可以放多个包；文档编辑插件是独立仓库，规格里不需要 `#path:`。

#### 锁定版本

ref 的位置两种规格不一样，容易踩：

| 插件 | 规格 |
|---|---|
| GitHub 连接器 | `…#v1.0.0&path:/github-connector` —— **ref 在 `&path:` 前面** |
| 文档编辑 | `github:hh719509125/dsh-preview-editor#v1.0.0` —— **ref 在 `#` 后面** |

两种情况都：ref 可以是分支、标签或**完整的 40 位 SHA**；**短 SHA 解析不了**（`git ls-remote` 不返回缩写 SHA）。

agent 会依次：从 GitHub 取包 → 作为依赖写进 profile 的 `package.json` → 在 profile 目录里运行 `pnpm` → 把包名加入 `dsh.profile.bundles` → 应用组合包自带的 patch 行。返回 `"application": "applied"` 即为生效。

两点注意：

- **权限**：`plugin_manager` 的每个动作都需要 `danger-full-access` 或当次批准。装进来的 Host 代码在工作区沙箱之外、以你的用户身份在本进程内执行——和在 Harness 里跑 bash 是同一层信任，装之前请先读一遍源码。
- **刷新页面**：安装是热应用的，但浏览器侧需要刷新一次才能加载新的 client bundle。

**另一种装法（想固定版本或离线）**：克隆仓库，然后把插件目录的绝对路径作为规格（文档编辑插件就是克隆后的仓库根目录）：

```
git clone https://github.com/hh719509125/deepseek_harness_plugin.git
plugin_manager { action: "install_bundle", target: "<克隆路径>/github-connector" }
```

> ⚠️ 路径装法下 profile 只记录路径、不复制文件，装好之后不要移动或删除那个目录。

### 兼容性

两个插件都是为 **DeepSeek Harness `0.2.0-rc.2`** 开发和验证的，并且各自依赖 DSH 的内部约定：文档编辑依赖 Connection 的 `/api` 精确 Fetch 路由和预览的 `documentPreviews` 渲染器注册表；GitHub 连接器依赖 `ctx.tools` 工具注册表（较稳定）。DSH 仍在 rc 阶段，这些**不承诺跨版本稳定**。插件刻意没有声明 `peerDependencies`——官方包声明的是 `@deepseek-ai/cordis`，而声明错的 peer 会让插件管理器**在安装前就拒绝**，那比装完再报错更难排查。所以：装完如果某个工具/渲染器不出现，先确认 DSH 版本。

### 目录结构

```
.
├── .gitattributes          # 统一按 LF 存储
├── .gitignore              # 仓库级忽略（node_modules、日志、本机 CA）
├── LICENSE                 # MIT，覆盖整个仓库
└── github-connector/       # 一个完整插件包
```

每个插件目录都是自包含的：`package.json`、Host 半边、Client 半边、`cordis.patch.yml`、locale、图标，以及自己那份 `LICENSE`。所以从仓库里单独拷一个目录出去也能直接装。文档编辑插件是另一个仓库里的完整包。

### 开发提示

- **机器相关配置放 profile 层，别写进插件包。** 插件包自带的 `cordis.patch.yml` 会应用到**每一个**安装它的 profile，所以绝对路径、本机证书这类东西要写到 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`——它优先级高于所有 bundle 层，而且不会被发布出去。热重载的 `hmr.root` 就是这么配的，见各插件 README 的「开发」一节。
- **热重载**：Host 半边（`index.js`）改完自动热重载，不用重启；Client 半边（`client.js`）属于浏览器侧，改完刷新页面即可。
- **不要就地改布局**：如果某个插件目录同时是一个 git 仓库（历史遗留），不要在那个目录里重排文件——DSH 的 profile 是按路径 `link:` 的，挪文件会让在线插件立刻加载失败。要改布局就在单独的检出里做。
- 发布用 `_tools/publish-plugins.ps1`（本地脚本，不在仓库里）：它按**显式白名单**把插件源同步进对应检出、显示 diff，加 `-Push` 才提交推送，所以本机忽略文件、CA 证书、散落产物都进不了仓库。
- 每个插件的 README 里都写了验证方式和已知边界，改之前先看一眼。

## License

[MIT](LICENSE)
