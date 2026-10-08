# 安装流程

这个插件是一个 **DSH 组合包（bundle）**：一个普通目录，靠 `package.json` 里的 `dsh.bundle.patch`
声明要插入的组合行。**不需要发布到 npm，也不用手改 profile 的 `package.json`。**

---

## 前置条件

| 项 | 说明 |
|---|---|
| DeepSeek Harness | 已安装并能打开（桌面端或 Web） |
| Node / pnpm | **不需要自己装**。DSH 自带运行时（`resources/runtime/versions.json` 声明 Node 24.18.1、pnpm 11.7.0） |
| GitHub 令牌 | 只有要读私有仓库时才必需；公开数据匿名也能用（每小时 60 次） |

---

## 一、放置插件目录

把整个 `github-connector` 目录放到一个**稳定**的位置，例如 `D:\plugins\github-connector`。

> 安装使用的是 pnpm 的 `link:` 协议：profile 里只记录**路径**，不会复制文件。
> 所以装好之后**不要移动或删除这个目录**，否则插件会加载失败。

---

## 二、机器相关的配置（只在需要时加）

插件包自带的 `cordis.patch.yml` **刻意不含任何本机路径**：bundle patch 会应用到每个安装它的
profile，一条绝对路径或一份本机证书会跟着跑到别人机器上。所以下面两项都不在包里，需要时写到
**你自己 profile 的 patch 层**：

```
<DSH_HOME>/profiles/<profile>/cordis.patch.yml
```

它的优先级高于所有 bundle 层，而且不会被发布出去。

```yaml
- id: github-connector
  config:
    caFile: /绝对/路径/your-ca.pem     # 只在 TLS 中间人环境下需要，见下
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.', '/放置你的插件的绝对路径/github-connector']   # 只在开发时需要
```

**`caFile`** —— 只有在「GitHub 域名被 hosts 指向本机、由 TLS 中间人代理」时才需要
（本机是瓦特工具箱 / Steam++.Accelerator）。判断方法：`Resolve-DnsName api.github.com`
返回 `127.0.0.1` 就是这种环境。

- 普通网络：**不需要这一项**，什么都不用加
- 中间人环境：加上，并把路径指向你那边的 CA

> 指向不存在的文件不会让插件崩溃：加载时会记一条警告，随后请求会因证书不受信而失败。

**`hmr.root`** —— 只有在你**改这个插件的源码**、想让改动热重载时才需要。

- 加上你放置目录的绝对路径（用正斜杠，例如 `D:/plugins/github-connector`）
- 不需要热重载：**整条 `hmr` 覆盖都不要加**

---

## 三、安装到 profile

安装动作由 **agent** 完成（`plugin_manager` 是 agent 工具，用户不直接调用）。把这条**规格**发给
你的 DSH agent：

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
```

`#path:/github-connector` 是 pnpm 的 git 子目录规格，所以**不需要发布到 npm，也不需要手动克隆**。
`plugin_manager` 需要 `danger-full-access` 或当次批准；装进来的 Host 代码在工作区沙箱之外、以你的
用户身份在本进程内执行，装之前请先读一遍 `index.js`。

想固定版本或离线，就用上面第一步克隆下来的目录，把**绝对路径**当规格：

```
plugin_manager { action: "install_bundle", target: "D:\\plugins\\github-connector" }
```

它会依次：

1. 把包作为 `link:` 依赖写进 profile 的 `package.json`
2. 在该 profile 目录里运行 `pnpm` 安装
3. 把包名加入 `dsh.profile.bundles`
4. 应用组合包自带的 patch 行

返回 `"application": "applied"` 即为生效 —— **首次安装是热应用的，不需要重启**
（实测：安装后四个工具立刻对模型可见）。

> ⚠️ **重复安装同一路径会报 `ambiguous-install`**：包已存在且依赖未变化时，管理器无法唯一定位目标。
> 改了代码或配置后想让改动生效：
> - Host 代码（`index.js`）→ 重启一次进程（见下），或已配好 `hmr.root` 时自动热重载
> - 配置 / 组合行 → `set_plugin`，`target` 填 `include:github-connector`，先 `enabled: false` 再 `true`

---

## 四、配置 GitHub 令牌

两种方式，任选其一。

**方式 A（推荐，免重启）** —— 打开 **设置 → GitHub** 页，粘贴令牌，点「测试并保存」。
页面会先拿令牌去 `api.github.com` 验证，通过后才写入凭据存储。

**方式 B（手写）** —— 编辑 `%USERPROFILE%\.dsh\.credentials.yaml`：

```yaml
version: 1
refs:
  GITHUB_TOKEN: ghp_你的令牌
```

该文件被监听并热重载，保存即生效，无需重启。

> 令牌权限：读公开数据用默认权限即可；读私有仓库需要 classic 令牌的 `repo` 范围，
> 或细粒度令牌的 `Contents / Issues / Pull requests / Metadata` 读权限。
> **未认证访问私有仓库时 GitHub 返回 404 而不是 403** —— 看到 404 通常是令牌没配上。

---

## 五、验证

| 检查 | 期望 |
|---|---|
| 设置 → 插件 | 能看到「GitHub 连接器」卡片（中文名、说明、图标） |
| 设置 → GitHub | 令牌显示「已配置」 |
| 让 agent 执行 `github_api`，`path: "/user"` | 返回你的账号 JSON |
| `github_api`，`path: "/rate_limit"` | 显示已认证配额（5000） |

如果工具报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 之类，见第二步的 `caFile`。

---

## 附：重启进程

这个应用默认「关闭窗口 → 缩到托盘」，点窗口右上角的 ✕ **不会**结束进程。正确做法：

- 任务栏托盘区图标 → 右键 → 退出，再从开始菜单打开
- 或在**普通的** PowerShell 窗口里（不能在 DSH 自带终端里）：

```powershell
Get-Process "DeepSeek Harness" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process "DeepSeek Harness.exe"
```

> 从 DSH 自己的 shell 里派生独立进程行不通 —— 沙箱会立刻杀掉它们，所以重启只能从外部发起。

---

## 卸载

```
plugin_manager { action: "remove_bundle", target: "@local/dsh-plugin-github" }
```

它会从 `dsh.profile.bundles` 移除并运行 `pnpm remove`。你在 profile patch 里加的 `caFile` /
`hmr` 覆盖要手动删掉——它们不属于插件包，所以不会随卸载一起消失。

---

## 迁移清单（换机器 / 给别人用）

**别人用**：直接给出 git 子目录规格就行，不需要复制目录：

```
plugin_manager { action: "install_bundle", target: "github:hh719509125/deepseek_harness_plugin#path:/github-connector" }
```

**换到你自己另一台机器**：

1. 复制 `github-connector` 目录到目标机器的稳定位置（或者用上面的规格装）
2. 让 agent 执行 `install_bundle`，`target` 填目标路径
3. 只有需要时才在**目标机 profile 的 patch 层**加 `caFile`（TLS 中间人环境）或 `hmr.root`（改源码热重载）
4. 配令牌（设置 → GitHub 页，或写 `.credentials.yaml`）
5. 验证 `github_api` → `/user`

包名 `@local/dsh-plugin-github` 是私有名，**不需要也不应该发布到 npm** —— 安装走 pnpm 的 git
子目录规格，不经过注册表。
