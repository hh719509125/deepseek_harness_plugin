/**
 * Browser half of @local/dsh-plugin-github: a GitHub settings page.
 *
 * The page owns what the Host cannot show a user: whether a token is
 * configured, and a way to replace it. It registers into the
 * `settings.section` slot and reaches the Host only through
 * `ctx.remote.credentials`, whose `describe` reports configured/writable
 * without ever returning the secret.
 *
 * The connection test runs in the browser on purpose: GitHub's REST API
 * answers with `Access-Control-Allow-Origin: *` and exposes its scope and
 * rate-limit headers, so a typed token can be proven against the real API
 * before it is stored. A stored token is never read back to re-test it —
 * that would mean the secret leaving the credentials store.
 *
 * Only `react` is required from the browser module table; no Harness Client
 * package is imported, so host-side refactors cannot break this page.
 *
 * @module @local/dsh-plugin-github/client
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-github',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace this page owns. */
    const NS = 'settings.github'
    /** Credential reference the Host plugin resolves by default. */
    const TOKEN_REF = 'GITHUB_TOKEN'
    /** Public GitHub endpoint the in-browser test targets. */
    const API_BASE = 'https://api.github.com'
    /** Class prefix keeping this page's rules out of the host's namespace. */
    const CLS = 'dsg'
    /** Settings nav position: after the shipped General/Models/Plugins/Agent presets pages. */
    const ORDER = 25

    const en = {
      title: 'GitHub',
      description: 'Connect DeepSeek Harness to GitHub with a Personal Access Token. The github_api, github_search, github_file and github_issues tools use it; it is stored outside the settings file and is never shown again after saving.',
      status: 'Token',
      configured: 'Configured',
      unconfigured: 'Not configured',
      readOnly: 'This deployment stores credentials read-only.',
      reference: 'Reference',
      loading: 'Checking…',
      unknown: 'Could not read the credential state.',
      replace: 'Replace token',
      tokenLabel: 'Personal Access Token',
      tokenHint: 'Paste a classic token (ghp_…) with the repo scope, or a fine-grained token with Contents / Issues / Pull requests / Metadata read. It is sent to api.github.com to verify, then stored by the Host.',
      test: 'Test and save',
      testing: 'Testing…',
      clear: 'Remove token',
      clearing: 'Removing…',
      empty: 'Paste a token first.',
      verified: 'Verified',
      signedInAs: 'Signed in as',
      scopes: 'Scopes',
      scopesNone: 'none reported',
      quota: 'Rate limit',
      quotaLeft: 'left this hour',
      failed: 'GitHub rejected this token.',
      networkFailed: 'Could not reach api.github.com from this browser.',
      removed: 'Token removed.',
      hostNote: 'This page verifies the token itself. Whether the agent’s tools can reach GitHub also depends on the Host process trusting the local accelerator’s certificate, which the plugin does through caFile.',
      enterpriseNote: 'The in-browser test always targets api.github.com; a GitHub Enterprise base URL is configured on the Host row instead.'
    }

    const zh = {
      title: 'GitHub',
      description: '用一个 Personal Access Token 把 DeepSeek Harness 连接到 GitHub。github_api、github_search、github_file、github_issues 四个工具用的就是它；令牌存在设置文件之外，保存后不会再显示。',
      status: '令牌',
      configured: '已配置',
      unconfigured: '未配置',
      readOnly: '本部署的凭据存储为只读。',
      reference: '引用名',
      loading: '读取中…',
      unknown: '读不到凭据状态。',
      replace: '更换令牌',
      tokenLabel: 'Personal Access Token',
      tokenHint: '粘贴 classic 令牌（ghp_…，勾选 repo），或细粒度令牌（Contents / Issues / Pull requests / Metadata 的 Read）。它会先发往 api.github.com 验证，再由 Host 储存。',
      test: '测试并保存',
      testing: '测试中…',
      clear: '移除令牌',
      clearing: '移除中…',
      empty: '请先粘贴令牌。',
      verified: '验证通过',
      signedInAs: '已登录为',
      scopes: '权限范围',
      scopesNone: '未报告',
      quota: '速率上限',
      quotaLeft: '本小时剩余',
      failed: 'GitHub 拒绝了这个令牌。',
      networkFailed: '浏览器无法访问 api.github.com。',
      removed: '令牌已移除。',
      hostNote: '本页验证的是令牌本身。Agent 的工具能否访问 GitHub，还取决于 Host 进程是否信任本机加速器的证书 —— 插件通过 caFile 完成这一步。',
      enterpriseNote: '浏览器侧测试固定访问 api.github.com；GitHub Enterprise 的地址在 Host 那一行配置。'
    }

    /** One style block, mounted with the page so unmounting removes it. */
    const styles = [
      `.${CLS}-root{display:flex;flex-direction:column;gap:20px;max-width:720px}`,
      `.${CLS}-title{margin:0;font-size:20px;font-weight:600;color:var(--dsw-alias-label-primary)}`,
      `.${CLS}-lede{margin:0;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}`,
      `.${CLS}-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:16px;display:flex;flex-direction:column;gap:12px}`,
      `.${CLS}-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}`,
      `.${CLS}-key{font-size:13px;color:var(--dsw-alias-label-secondary);min-width:64px}`,
      `.${CLS}-value{font-size:13px;color:var(--dsw-alias-label-primary)}`,
      `.${CLS}-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}`,
      `.${CLS}-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1)}`,
      `.${CLS}-badge-on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}`,
      `.${CLS}-badge-off{color:var(--dsw-alias-state-idle-primary)}`,
      `.${CLS}-dot{width:6px;height:6px;border-radius:50%;background:currentColor}`,
      `.${CLS}-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}`,
      `.${CLS}-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}`,
      // Copied from the host's own primitives so controls match the application:
      // Button.module.css (.button/.primary/.outline) and settings-form/fields.module.css (.input).
      // A foreground always comes from the token paired with its background, never a literal.
      `.${CLS}-input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);outline:none}`,
      `.${CLS}-input::placeholder{color:var(--dsw-alias-label-dimmed)}`,
      `.${CLS}-input:focus-visible{border-color:var(--dsw-alias-state-business-primary)}`,
      `.${CLS}-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}`,
      `.${CLS}-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer}`,
      `.${CLS}-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.${CLS}-btn:disabled{cursor:not-allowed;opacity:.4}`,
      `.${CLS}-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}`,
      `.${CLS}-btn-primary:hover:enabled{background:var(--dsw-alias-button-primary-hover)}`,
      `.${CLS}-btn-outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}`,
      `.${CLS}-result{font-size:12px;line-height:1.7;border-radius:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}`,
      `.${CLS}-result-ok{border-color:var(--dsw-alias-state-success-primary)}`,
      `.${CLS}-result-err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}`,
      `.${CLS}-note{margin:0;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary)}`
    ].join('\n')

    /**
     * Credential notifications for one mounted page.
     *
     * The store cannot live in React: the Host pushes changes to a module-level
     * listener registered in `apply`, which has no component to update.
     */
    function createCredentialWatch(ctx) {
      const listeners = new Set()
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        /** Re-read after the Host reports the reference changed elsewhere. */
        notify() {
          for (const listener of listeners) listener()
        },
        start() {
          if (typeof ctx.remote?.$on !== 'function') return () => {}
          return ctx.remote.$on('credentials/reference-updated', () => this.notify())
        }
      }
    }

    /** Read the token's configured state from the Host credentials domain. */
    async function readCredential(ctx) {
      try {
        const response = await ctx.remote.credentials.describe([TOKEN_REF])
        if (response?.ok === false) return { state: 'error' }
        const view = response?.value?.[TOKEN_REF]
        return {
          state: 'ready',
          configured: view?.configured === true,
          writable: view?.writable !== false
        }
      } catch {
        return { state: 'error' }
      }
    }

    /** Pull GitHub's own explanation out of a rejected response. */
    async function rejectionMessage(response) {
      try {
        const body = await response.json()
        return typeof body?.message === 'string' && body.message.length > 0 ? ` — ${body.message}` : ''
      } catch {
        return ''
      }
    }

    /**
     * The settings page. `ctx`, `t` and the watch arrive as props from the
     * registration closure, so no registration option beyond `id`, `order` and
     * `label` is assumed.
     */
    function GitHubSection(props) {
      const { ctx, t, watch } = props
      const [credential, setCredential] = React.useState({ state: 'loading' })
      const [draft, setDraft] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [result, setResult] = React.useState({ state: 'idle' })

      React.useEffect(() => {
        let cancelled = false
        const load = () => {
          readCredential(ctx).then((next) => {
            if (!cancelled) setCredential(next)
          })
        }
        load()
        const unsubscribe = watch.subscribe(load)
        return () => {
          cancelled = true
          unsubscribe()
        }
      }, [ctx, watch])

      const disabled = busy || credential.writable === false

      /**
       * Verify the typed token against the real API, then store it. Nothing is
       * saved until GitHub itself has accepted the credential.
       */
      async function testAndSave() {
        const token = draft.trim()
        if (token.length === 0) {
          setResult({ state: 'error', text: t('empty') })
          return
        }
        setBusy(true)
        setResult({ state: 'running' })
        try {
          const response = await fetch(`${API_BASE}/user`, {
            headers: {
              accept: 'application/vnd.github+json',
              authorization: `Bearer ${token}`,
              'x-github-api-version': '2022-11-28'
            }
          })
          if (!response.ok) {
            setResult({ state: 'error', text: `${t('failed')} HTTP ${response.status}${await rejectionMessage(response)}` })
            return
          }
          const body = await response.json()
          const write = await ctx.remote.credentials.set(TOKEN_REF, token)
          if (write?.ok === false) {
            setResult({ state: 'error', text: t('unknown') })
            return
          }
          const scopes = response.headers.get('x-oauth-scopes')
          setResult({
            state: 'ok',
            text: `${t('verified')} — ${t('signedInAs')} ${body?.login ?? '?'}`,
            meta: [
              `${t('scopes')}: ${scopes !== null && scopes.length > 0 ? scopes : t('scopesNone')}`,
              `${t('quota')}: ${response.headers.get('x-ratelimit-remaining') ?? '?'} / ${response.headers.get('x-ratelimit-limit') ?? '?'} ${t('quotaLeft')}`
            ]
          })
          setDraft('')
          setCredential(await readCredential(ctx))
        } catch (error) {
          setResult({ state: 'error', text: `${t('networkFailed')} ${error?.message ?? String(error)}` })
        } finally {
          setBusy(false)
        }
      }

      /** Forget the stored token; the tools then report a missing token. */
      async function clearToken() {
        setBusy(true)
        try {
          await ctx.remote.credentials.unset(TOKEN_REF)
          setResult({ state: 'idle', text: t('removed') })
          setCredential(await readCredential(ctx))
        } catch (error) {
          setResult({ state: 'error', text: `${t('unknown')} ${error?.message ?? String(error)}` })
        } finally {
          setBusy(false)
        }
      }

      const badge = credential.state === 'loading'
        ? h('span', { className: `${CLS}-badge ${CLS}-badge-off` }, t('loading'))
        : credential.state === 'error'
          ? h('span', { className: `${CLS}-badge ${CLS}-badge-off` }, t('unknown'))
          : credential.configured
            ? h('span', { className: `${CLS}-badge ${CLS}-badge-on` }, h('span', { className: `${CLS}-dot` }), t('configured'))
            : h('span', { className: `${CLS}-badge ${CLS}-badge-off` }, h('span', { className: `${CLS}-dot` }), t('unconfigured'))

      const resultClass = result.state === 'ok'
        ? `${CLS}-result ${CLS}-result-ok`
        : result.state === 'error'
          ? `${CLS}-result ${CLS}-result-err`
          : `${CLS}-result`

      return h('section', { className: `${CLS}-root` },
        h('style', null, styles),
        h('h2', { className: `${CLS}-title` }, t('title')),
        h('p', { className: `${CLS}-lede` }, t('description')),

        h('div', { className: `${CLS}-card` },
          h('div', { className: `${CLS}-row` },
            h('span', { className: `${CLS}-key` }, t('status')),
            badge
          ),
          h('div', { className: `${CLS}-row` },
            h('span', { className: `${CLS}-key` }, t('reference')),
            h('code', { className: `${CLS}-value ${CLS}-mono` }, TOKEN_REF)
          ),
          credential.writable === false ? h('p', { className: `${CLS}-hint` }, t('readOnly')) : null
        ),

        h('div', { className: `${CLS}-card` },
          h('label', { className: `${CLS}-label`, htmlFor: `${CLS}-token` }, t('replace')),
          h('input', {
            id: `${CLS}-token`,
            className: `${CLS}-input`,
            type: 'password',
            autoComplete: 'off',
            spellCheck: false,
            placeholder: 'ghp_…',
            value: draft,
            disabled,
            onChange: (event) => setDraft(event.target.value)
          }),
          h('p', { className: `${CLS}-hint` }, t('tokenHint')),
          h('div', { className: `${CLS}-row` },
            h('button', {
              type: 'button',
              className: `${CLS}-btn ${CLS}-btn-primary`,
              disabled,
              onClick: testAndSave
            }, busy ? t('testing') : t('test')),
            h('button', {
              type: 'button',
              className: `${CLS}-btn ${CLS}-btn-outline`,
              disabled: busy || credential.configured !== true,
              onClick: clearToken
            }, busy ? t('clearing') : t('clear'))
          )
        ),

        result.state === 'idle' && result.text === undefined ? null : h('div', { className: resultClass },
          result.text === undefined ? null : h('div', null, result.text),
          ...(result.meta ?? []).map((line, index) => h('div', { key: index }, line))
        ),

        h('p', { className: `${CLS}-note` }, t('hostNote')),
        h('p', { className: `${CLS}-note` }, t('enterpriseNote'))
      )
    }

    /** Services this page needs before it can render. */
    const inject = ['slots', 'locale', 'remote', 'remote.credentials']

    /**
     * Register the settings page.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const watch = createCredentialWatch(ctx)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'github-connector: dictionaries')
      ctx.effect(() => watch.start(), 'github-connector: credential notifications')
      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'github',
        order: ORDER,
        label: () => t('title')
      }, () => h(GitHubSection, { ctx, t, watch }))), 'github-connector: settings page')
    }

    return { inject, apply }
  }
})
