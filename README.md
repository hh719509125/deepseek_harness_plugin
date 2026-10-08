# DeepSeek Harness 插件集

给 [DeepSeek Harness](https://github.com/hh719509125)（DSH）用的插件集合。每个子目录都是一个**独立、可单独安装**的 DSH 组合包（bundle）：一个普通目录，靠 `package.json` 里的 `dsh.bundle.patch` 声明要插入的组合行。**不需要发布到 npm，也不用手改 profile 的 `package.json`。**

## 插件

| 插件 | 目录 | 作用 |
|---|---|---|
| **文档编辑** | [`document-editor/`](document-editor/) | 在右侧栏的文档预览里**直接编辑文本文件**并保存：保存/撤销、Ctrl+S、冲突保护、行尾保留。内置预览是只读的，这个插件补上写入通路 |
| **GitHub 连接器** | [`github-connector/`](github-connector/) | 用 Personal Access Token **只读**访问 GitHub：`github_api`、`github_search`、`github_file`、`github_issues` 四个工具，以及一个令牌设置页 |

各自的说明、配置项和边界都写在插件目录的 `README.md` 里。

## 安装

插件由 **agent** 安装（`plugin_manager` 是 agent 工具，用户不直接调用）。把要装的插件目录路径告诉你的 DSH agent：

```
plugin_manager { action: "install_bundle", target: "<本仓库路径>/document-editor" }
```

它会依次：把包作为 `link:` 依赖写进 profile 的 `package.json` → 在该 profile 目录里运行 `pnpm` 安装 → 把包名加入 `dsh.profile.bundles` → 应用组合包自带的 patch 行。返回 `"application": "applied"` 即为生效，**首次安装是热应用的，不需要重启**（浏览器侧需要刷新一次页面）。

> ⚠️ 安装用的是 pnpm 的 `link:` 协议：profile 里只记录**路径**，不复制文件。所以装好之后**不要移动或删除插件目录**，否则插件会加载失败。

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
