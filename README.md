# DeepSeek Harness 插件集

给 [DeepSeek Harness](https://github.com/hh719509125)（DSH）用的插件集合。每个子目录都是一个**独立、可单独安装**的 DSH 组合包（bundle）：一个普通目录，靠 `package.json` 里的 `dsh.bundle.patch` 声明要插入的组合行。**不需要发布到 npm，也不用手改 profile 的 `package.json`。**

## 插件

| 插件 | 目录 | 作用 |
|---|---|---|
| **文档编辑** | [`document-editor/`](document-editor/) | 在右侧栏的文档预览里**直接编辑文本文件**并保存：保存/撤销、Ctrl+S、冲突保护、行尾保留。内置预览是只读的，这个插件补上写入通路 |
| **GitHub 连接器** | [`github-connector/`](github-connector/) | 用 Personal Access Token **只读**访问 GitHub：`github_api`、`github_search`、`github_file`、`github_issues` 四个工具，以及一个令牌设置页 |

各自的说明、配置项和边界都写在插件目录的 `README.md` 里。

## 安装

插件由 **agent** 安装（`plugin_manager` 是 agent 工具，用户不直接调用）。把下面这条**规格**发给你的 DSH agent 即可：

| 插件 | 安装规格 |
|---|---|
| 文档编辑 | `github:hh719509125/deepseek_harness_plugin#path:/document-editor` |
| GitHub 连接器 | `github:hh719509125/deepseek_harness_plugin#path:/github-connector` |

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/document-editor" }
```

`#path:/<子目录>` 是 pnpm 的 git 子目录规格，所以**不需要发布到 npm**，也不需要手动克隆。

### 锁定版本

上面的规格跟踪 `main`。要钉住某个版本，把 ref 放在 `#` 后面、`&path:` **之前**：

| 目的 | 规格 |
|---|---|
| 跟踪最新 | `github:hh719509125/deepseek_harness_plugin#path:/document-editor` |
| 钉到某个 release | `github:hh719509125/deepseek_harness_plugin#v1.0.0&path:/document-editor` |
| 钉到确切提交 | `github:hh719509125/deepseek_harness_plugin#<完整 40 位 commit SHA>&path:/document-editor` |

三点是实测出来的，容易踩：

- **ref 必须在前面**。`#path:/document-editor&tag=v1.0.0` 这种写法**无效**（安装直接失败）。
- **必须用完整的 40 位 SHA**。短 SHA 解析不了——`git ls-remote` 不返回缩写 SHA。
- 分支、标签、完整 SHA 三种都可以；pnpm 最后都会把解析结果写进 lockfile（`…git#<commit>&path:/document-editor`），所以 `main` 也会被锁到当时的提交。

agent 会依次：从 GitHub 取包 → 作为依赖写进 profile 的 `package.json` → 在 profile 目录里运行 `pnpm` → 把包名加入 `dsh.profile.bundles` → 应用组合包自带的 patch 行。返回 `"application": "applied"` 即为生效。

两点注意：

- **权限**：`plugin_manager` 的每个动作都需要 `danger-full-access` 或当次批准。装进来的 Host 代码在工作区沙箱之外、以你的用户身份在本进程内执行——和在 Harness 里跑 bash 是同一层信任，装之前请先读一遍源码。
- **刷新页面**：安装是热应用的，但浏览器侧需要刷新一次才能加载新的 client bundle。

**另一种装法（想固定版本或离线）**：克隆仓库，然后把插件目录的绝对路径作为规格：

```
git clone https://github.com/hh719509125/deepseek_harness_plugin.git
plugin_manager { action: "install_bundle", target: "<克隆路径>/document-editor" }
```

> ⚠️ 安装用的是 pnpm 的 `link:`（路径装法）或 git 依赖（规格装法）。**路径装法**下 profile 只记录路径、不复制文件，所以装好之后不要移动或删除那个目录。

## 兼容性

这些插件是为 **DeepSeek Harness `0.2.0-rc.2`** 开发和验证的，并且依赖 DSH 的两处内部约定：

- 文档编辑：Connection 的 `/api` 精确 Fetch 路由，以及预览的 `documentPreviews` 渲染器注册表
- GitHub 连接器：`ctx.tools` 工具注册表（较稳定）

DSH 仍在 rc 阶段，这些内部约定**不承诺跨版本稳定**。插件刻意没有声明 `peerDependencies`——官方包声明的是 `@deepseek-ai/cordis`，而声明错的 peer 会让插件管理器**在安装前就拒绝**，那比装完再报错更难排查。所以：装完如果某个工具/渲染器不出现，先确认 DSH 版本。

## 目录结构

```
.
├── .gitattributes          # 统一按 LF 存储
├── .gitignore              # 仓库级忽略（node_modules、日志、本机 CA）
├── LICENSE                 # MIT，覆盖整个仓库
├── github-connector/       # 一个完整插件包
└── document-editor/        # 一个完整插件包
```

每个插件目录都是自包含的：`package.json`、Host 半边、Client 半边、`cordis.patch.yml`、locale、图标，以及自己那份 `LICENSE`。所以从仓库里单独拷一个目录出去也能直接装。

## 开发提示

- **机器相关配置**：`cordis.patch.yml` 里 `hmr.root` 写的是**本机绝对路径**（用来热重载）。换机器时改成目标机路径，或整条 `hmr` 覆盖删掉。
- **热重载**：Host 半边（`index.js`）改完自动热重载，不用重启；Client 半边（`client.js`）属于浏览器侧，改完刷新页面即可。
- **不要就地改布局**：如果某个插件目录同时是一个 git 仓库（历史遗留），不要在那个目录里重排文件——DSH 的 profile 是按路径 `link:` 的，挪文件会让在线插件立刻加载失败。要改布局就在单独的检出里做。
- 每个插件的 README 里都写了验证方式和已知边界，改之前先看一眼。

## License

[MIT](LICENSE)
