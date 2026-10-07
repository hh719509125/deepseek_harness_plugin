/**
 * Read-only GitHub tools for DeepSeek Harness (DSH).
 *
 * Registers four model-facing tools that call the GitHub REST API with a
 * Personal Access Token: `github_api`, `github_search`, `github_file`, and
 * `github_issues`. Every request is a GET; the plugin cannot modify anything on
 * GitHub.
 *
 * The module imports nothing but Node builtins — no DSH package, no npm
 * package — so a profile-installed copy loads even when pnpm links the package
 * from outside the profile directory, where bare-specifier resolution of
 * `@deepseek-ai/*` would fail.
 *
 * @module @local/dsh-plugin-github
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

/** Directory of this module, the base for a relative `caFile`. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Cordis plugin name used by loader diagnostics. */
export const name = 'github-connector'

/** The tool registry is the only required service; `credentials` stays optional. */
export const inject = ['tools']

const DEFAULT_API_BASE_URL = 'https://api.github.com'
const DEFAULT_TOKEN_ENV = 'GITHUB_TOKEN'
/** Tried in order when the configured reference resolves to nothing. */
const FALLBACK_TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_OUTPUT_CHARS = 60000
const GITHUB_API_VERSION = '2022-11-28'
const USER_AGENT = 'dsh-github-connector'
const REFERENCE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u
const SEARCH_KINDS = ['repositories', 'code', 'issues', 'users']
const ISSUE_KINDS = ['issues', 'pulls']
const ISSUE_STATES = ['open', 'closed', 'all']

/**
 * Read the row's config with defaults, accepting anything the patch layer holds.
 *
 * @param raw - the loader row config, possibly absent or malformed.
 * @returns resolved settings for every tool.
 */
function readConfig(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    apiBaseUrl: nonBlankString(source.apiBaseUrl)?.replace(/\/+$/u, '') ?? DEFAULT_API_BASE_URL,
    tokenEnv: nonBlankString(source.tokenEnv) ?? DEFAULT_TOKEN_ENV,
    timeoutMs: positiveNumber(source.timeoutMs) ?? DEFAULT_TIMEOUT_MS,
    maxOutputChars: positiveInteger(source.maxOutputChars) ?? DEFAULT_MAX_OUTPUT_CHARS,
    caFile: nonBlankString(source.caFile),
  }
}

/** A trimmed non-empty string, or `undefined`. */
function nonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** A positive finite number, or `undefined`. */
function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** A positive integer, or `undefined`. */
function positiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * Order the credential references to try: the configured one first, then the
 * conventional `GITHUB_TOKEN` and `GH_TOKEN`.
 *
 * @param tokenEnv - the configured reference.
 * @returns valid, de-duplicated reference names.
 */
function tokenEnvNames(tokenEnv) {
  const names = []
  for (const candidate of [tokenEnv, ...FALLBACK_TOKEN_ENVS]) {
    if (typeof candidate === 'string' && REFERENCE_PATTERN.test(candidate) && !names.includes(candidate)) names.push(candidate)
  }
  return names
}

/**
 * Resolve the token behind the first configured reference that has a value.
 *
 * `ctx.credentials` layers the stored credential, the process environment, and
 * `.env` files; reading `process.env` directly keeps the plugin working in a
 * composition without that service.
 *
 * @param ctx - plugin context, whose optional `credentials` service is consulted.
 * @param names - credential references to try in order.
 * @returns the token and the reference that supplied it, or `undefined`.
 */
async function resolveToken(ctx, names) {
  const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
  for (const envName of names) {
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(envName)
        const stored = nonBlankString(hit?.value)
        if (stored !== undefined) return { token: stored, source: envName }
      } catch (error) {
        ctx.logger?.debug?.(`github-connector: credentials.resolve(${envName}) failed: ${error?.message ?? String(error)}`)
      }
    }
    const ambient = nonBlankString(process.env[envName])
    if (ambient !== undefined) return { token: ambient, source: envName }
  }
  return undefined
}

/** Require a non-empty string argument. */
function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`github: "${label}" must be a non-empty string`)
  return value.trim()
}

/** Require an optional string argument drawn from a closed set. */
function requireEnum(value, allowed, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`github: "${label}" must be one of ${allowed.join(', ')}`)
  return value
}

/** Bound an optional result count. */
function clampLimit(value, fallback, max) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) throw new Error('github: "limit" must be a positive number')
  return Math.min(Math.floor(value), max)
}

/** Coerce a model-supplied query object into scalar query-string values. */
function normalizeParams(value) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('github: "params" must be an object of query values')
  const params = {}
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue
    if (typeof raw === 'object') throw new Error(`github: params.${key} must be a scalar value`)
    params[key] = String(raw)
  }
  return params
}

/** Build the request URL, keeping a full URL on the configured API host only. */
function buildUrl(apiBaseUrl, path, params) {
  const requested = requireString(path, 'path')
  let url
  if (/^https?:\/\//iu.test(requested)) {
    url = new URL(requested)
    if (url.origin !== new URL(apiBaseUrl).origin) {
      throw new Error(`github: an absolute path must stay on ${apiBaseUrl}; "${url.origin}" is not allowed`)
    }
  } else {
    url = new URL(`${apiBaseUrl}${requested.startsWith('/') ? requested : `/${requested}`}`)
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

/** Turn one failed response into an actionable message. */
function describeFailure(response, text, url) {
  const detail = parseJson(text)
  const message = nonBlankString(detail?.message)
  const hints = []
  const remaining = response.headers.get('x-ratelimit-remaining')
  if (response.status === 401) hints.push('the token is missing or rejected — check the stored Personal Access Token')
  if (response.status === 403 && remaining === '0') hints.push('the token hit its rate limit; wait for the reset or use a token with a higher limit')
  else if (response.status === 403) hints.push('the token lacks the scope this endpoint needs')
  if (response.status === 404) hints.push('the resource does not exist, or the token cannot see a private repository')
  const suffix = hints.length > 0 ? ` (${hints.join('; ')})` : ''
  return `github: HTTP ${response.status} from ${url.pathname}${message !== undefined ? ` — ${message}` : ''}${suffix}`
}

/** Parse JSON, returning `undefined` for a non-JSON or malformed body. */
function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Cut an oversized body with an explicit, recoverable notice. */
function truncate(text, maxChars) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n… truncated ${text.length - maxChars} characters; narrow the request (per_page, a more specific path, or a tighter query) to read the rest.`
}

/** Pretty-print a JSON body and keep any other body verbatim. */
function formatBody(text, contentType, maxChars) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return '(empty body)'
  if (/json/iu.test(contentType)) {
    const parsed = parseJson(trimmed)
    if (parsed !== undefined) return truncate(JSON.stringify(parsed, null, 2), maxChars)
  }
  return truncate(trimmed, maxChars)
}

/** Decode the base64 payload of the contents API. */
function decodeBase64(encoded) {
  if (typeof Buffer !== 'undefined') return Buffer.from(encoded, 'base64').toString('utf8')
  const binary = atob(encoded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

/** URI-encode every segment of a repository-relative path. */
function encodeRepoPath(path) {
  return path.split('/').filter((segment) => segment.length > 0).map((segment) => encodeURIComponent(segment)).join('/')
}

/**
 * Perform one authenticated GET and surface transport failures as errors.
 *
 * @param ctx - plugin context used to resolve the token.
 * @param settings - resolved plugin settings.
 * @param request - API path, query values, and optional `Accept` override.
 * @param signal - the tool call's cancellation signal, when present.
 * @returns the response, its body text, and the final URL.
 */
async function requestGithub(ctx, settings, request, signal) {
  const names = tokenEnvNames(settings.tokenEnv)
  const auth = await resolveToken(ctx, names)
  if (auth === undefined) {
    throw new Error(`github-connector: no GitHub token found. Store one of ${names.join(', ')} — in the DSH credentials store, in the Harness home .env, or in the launching environment — then retry.`)
  }
  const url = buildUrl(settings.apiBaseUrl, request.path, request.params ?? {})
  const timeout = AbortSignal.timeout(settings.timeoutMs)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: combined,
      headers: {
        accept: request.accept ?? 'application/vnd.github+json',
        authorization: `Bearer ${auth.token}`,
        'user-agent': USER_AGENT,
        'x-github-api-version': GITHUB_API_VERSION,
      },
    })
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error(`github: the request to ${url.pathname} exceeded the ${settings.timeoutMs} ms timeout`)
    if (error?.name === 'AbortError') throw new Error(`github: the request to ${url.pathname} was cancelled`)
    const cause = error?.cause
    const detail = cause === undefined || cause === null ? '' : ` (${cause.code ?? cause.message ?? String(cause)})`
    const note = settings.trustNote === undefined ? '' : ` — ${settings.trustNote}`
    throw new Error(`github: the request to ${url.pathname} failed — ${error?.message ?? String(error)}${detail}${note}`)
  }
  const text = await response.text()
  if (!response.ok) throw new Error(describeFailure(response, text, url))
  return { response, text, url, source: auth.source }
}

/** Prefix a body with the transport facts the model needs to trust it. */
function withStatus(response, url, body) {
  return `HTTP ${response.status} — GET ${url.toString()}\n\n${body}`
}

/** The repository part of an `api.github.com/repos/<owner>/<repo>` URL. */
function repositoryOf(apiUrl) {
  const match = /\/repos\/([^/]+\/[^/]+)$/u.exec(typeof apiUrl === 'string' ? apiUrl : '')
  return match?.[1] ?? '(unknown repository)'
}

/** One line per search hit, projected to the fields that answer a question. */
function describeSearchItem(kind, item) {
  if (item === null || typeof item !== 'object') return `- ${JSON.stringify(item)}`
  switch (kind) {
    case 'repositories':
      return `- ${item.full_name} ★${item.stargazers_count ?? 0}${item.private === true ? ' (private)' : ''} — ${item.description ?? '(no description)'}\n  ${item.html_url} · language ${item.language ?? 'n/a'} · updated ${item.updated_at ?? 'n/a'}`
    case 'code':
      return `- ${item.repository?.full_name ?? '(unknown repository)'} · ${item.path}\n  ${item.html_url}`
    case 'issues':
      return `- ${repositoryOf(item.repository_url)}#${item.number} [${item.state}] ${item.title}${item.pull_request === undefined ? '' : ' (pull request)'}\n  ${item.html_url} · ${item.comments ?? 0} comments · updated ${item.updated_at ?? 'n/a'}`
    case 'users':
      return `- ${item.login} (${item.type ?? 'User'})\n  ${item.html_url}`
    default:
      return `- ${JSON.stringify(item)}`
  }
}

/** Render one search page without dumping the raw provider payload. */
function summarizeSearch(kind, data, text, contentType, maxChars) {
  if (data === null || typeof data !== 'object' || !Array.isArray(data.items)) {
    return formatBody(text, contentType, maxChars)
  }
  const lines = [`total_count: ${data.total_count ?? data.items.length}`, `returned: ${data.items.length}`, '']
  for (const item of data.items) lines.push(describeSearchItem(kind, item))
  if (data.incomplete_results === true) lines.push('', 'note: GitHub reported incomplete_results for this query.')
  return truncate(lines.join('\n'), maxChars)
}

/** Build a tool whose model-facing payload is a single text block. */
function contentTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { content: { type: 'string', description: 'The model-facing text for this result.' } },
        required: ['content'],
      },
      render: (_args, value) => [{ type: 'text', text: typeof value?.content === 'string' ? value.content : '' }],
    },
    ...positiveNumber(options.timeoutMs) === undefined ? {} : { timeoutMs: options.timeoutMs },
    isConcurrencySafe: () => true,
    execute: (args, exec) => options.run(args !== null && typeof args === 'object' ? args : {}, exec),
  }
}

/** The generic authenticated GET, the escape hatch for every endpoint. */
function githubApiTool(ctx, settings) {
  return contentTool({
    name: 'github_api',
    description: 'Send one authenticated GET to the GitHub REST API and return the status and the JSON (or plain-text) body. Use it for any read-only endpoint that the other github tools do not cover. Only GET is possible: this plugin never writes to GitHub. Private repositories, higher rate limits, and organization data are visible exactly as far as the configured token allows.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'API path starting with "/", for example "/repos/octocat/Hello-World/issues", "/repos/{owner}/{repo}/pulls/12/reviews", or "/user". A full URL on the configured API host is also accepted.',
        },
        params: {
          type: 'object',
          additionalProperties: true,
          description: 'Optional flat object of query-string values, for example {"state":"open","per_page":10}.',
        },
      },
      required: ['path'],
    },
    timeoutMs: settings.timeoutMs + 5000,
    run: async (args, exec) => {
      const request = { path: requireString(args.path, 'path'), params: normalizeParams(args.params) }
      const { response, text, url } = await requestGithub(ctx, settings, request, exec?.signal)
      const body = formatBody(text, response.headers.get('content-type') ?? '', settings.maxOutputChars)
      return { content: withStatus(response, url, body) }
    },
  })
}

/** Repository, code, issue, and user search. */
function githubSearchTool(ctx, settings) {
  return contentTool({
    name: 'github_search',
    description: 'Search GitHub with the authenticated token. Returns a compact, readable list of hits — for repositories the full name, stars, language and description; for code the repository and file path; for issues the number, state and title; for users the login. Use github_api when you need the raw search payload or a field this list omits.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'GitHub search qualifiers work here, for example "language:typescript stars:>500", "repo:owner/name TODO", or "is:pr is:open author:me".',
        },
        kind: {
          type: 'string',
          enum: SEARCH_KINDS,
          description: 'Which search index to query. Defaults to repositories.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum hits to return, 1–100. Defaults to 20.',
        },
      },
      required: ['query'],
    },
    timeoutMs: settings.timeoutMs + 5000,
    run: async (args, exec) => {
      const kind = requireEnum(args.kind, SEARCH_KINDS, 'kind', 'repositories')
      const query = requireString(args.query, 'query')
      const limit = clampLimit(args.limit, 20, 100)
      const { response, text, url } = await requestGithub(ctx, settings, { path: `/search/${kind}`, params: { q: query, per_page: String(limit) } }, exec?.signal)
      const body = summarizeSearch(kind, parseJson(text), text, response.headers.get('content-type') ?? '', settings.maxOutputChars)
      return { content: withStatus(response, url, body) }
    },
  })
}

/** Read one file, or list one directory, from a repository. */
function githubFileTool(ctx, settings) {
  return contentTool({
    name: 'github_file',
    description: 'Read a file from a GitHub repository at an optional branch, tag, or commit, returning its UTF-8 text. When the path names a directory it returns that directory\'s entries instead. Works on private repositories the token can read. Use a ref to pin an exact revision; without one the repository\'s default branch is used.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        owner: { type: 'string', description: 'Repository owner, the user or organization login.' },
        repo: { type: 'string', description: 'Repository name without the owner prefix.' },
        path: { type: 'string', description: 'Path inside the repository, for example "src/index.ts" or "docs".' },
        ref: { type: 'string', description: 'Optional branch, tag, or commit SHA. Defaults to the default branch.' },
      },
      required: ['owner', 'repo', 'path'],
    },
    timeoutMs: settings.timeoutMs + 5000,
    run: async (args, exec) => {
      const owner = requireString(args.owner, 'owner')
      const repo = requireString(args.repo, 'repo')
      const path = requireString(args.path, 'path').replace(/^\/+/u, '')
      const ref = nonBlankString(args.ref)
      const apiPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}`
      const params = ref === undefined ? {} : { ref }
      const first = await requestGithub(ctx, settings, { path: apiPath, params }, exec?.signal)
      const data = parseJson(first.text)
      const header = `${owner}/${repo} · ${path}${ref === undefined ? '' : ` @ ${ref}`}`
      if (Array.isArray(data)) {
        const entries = data.map((entry) => `- ${entry.type === 'dir' ? 'dir ' : 'file'} ${entry.path}${entry.type === 'file' ? ` (${entry.size} bytes)` : ''}`)
        return { content: withStatus(first.response, first.url, `${header} is a directory\n\n${truncate(entries.join('\n'), settings.maxOutputChars)}`) }
      }
      if (data !== null && typeof data === 'object' && data.type === 'file' && typeof data.content === 'string' && data.encoding === 'base64') {
        const text = decodeBase64(data.content.replace(/\n/gu, ''))
        const notice = data.size > 1000000 ? '\n\nnote: GitHub returned this file through its base64 contents API; very large files are truncated upstream.' : ''
        return { content: withStatus(first.response, first.url, `${header} (${data.size ?? text.length} bytes, sha ${data.sha ?? 'n/a'})\n\n${truncate(text, settings.maxOutputChars)}${notice}`) }
      }
      if (data !== null && typeof data === 'object' && data.type === 'file') {
        const raw = await requestGithub(ctx, settings, { path: apiPath, params, accept: 'application/vnd.github.raw' }, exec?.signal)
        return { content: withStatus(raw.response, raw.url, `${header} (raw)\n\n${truncate(raw.text, settings.maxOutputChars)}`) }
      }
      if (data !== null && typeof data === 'object' && typeof data.type === 'string') {
        return { content: withStatus(first.response, first.url, `${header} is a ${data.type}${typeof data.target === 'string' ? ` → ${data.target}` : ''}\n\n${truncate(first.text, settings.maxOutputChars)}`) }
      }
      return { content: withStatus(first.response, first.url, formatBody(first.text, first.response.headers.get('content-type') ?? '', settings.maxOutputChars)) }
    },
  })
}

/** List issues or pull requests of one repository. */
function githubIssuesTool(ctx, settings) {
  return contentTool({
    name: 'github_issues',
    description: 'List issues or pull requests of one repository, newest activity first, with their number, state, title, comment count and labels. Use labels to filter issues, and github_api on "/repos/{owner}/{repo}/issues/{number}" for one item\'s full body and comments.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        owner: { type: 'string', description: 'Repository owner, the user or organization login.' },
        repo: { type: 'string', description: 'Repository name without the owner prefix.' },
        kind: {
          type: 'string',
          enum: ISSUE_KINDS,
          description: 'List issues (which include pull requests, flagged as such) or pull requests only. Defaults to issues.',
        },
        state: {
          type: 'string',
          enum: ISSUE_STATES,
          description: 'Filter by state. Defaults to open.',
        },
        labels: { type: 'string', description: 'Comma-separated label names to require. Issues only; ignored for pull requests.' },
        limit: { type: 'integer', description: 'Maximum items to return, 1–100. Defaults to 20.' },
      },
      required: ['owner', 'repo'],
    },
    timeoutMs: settings.timeoutMs + 5000,
    run: async (args, exec) => {
      const owner = requireString(args.owner, 'owner')
      const repo = requireString(args.repo, 'repo')
      const kind = requireEnum(args.kind, ISSUE_KINDS, 'kind', 'issues')
      const state = requireEnum(args.state, ISSUE_STATES, 'state', 'open')
      const limit = clampLimit(args.limit, 20, 100)
      const params = { state, per_page: String(limit), sort: 'updated', direction: 'desc' }
      const labels = nonBlankString(args.labels)
      if (kind === 'issues' && labels !== undefined) params.labels = labels
      const { response, text, url } = await requestGithub(ctx, settings, { path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${kind}`, params }, exec?.signal)
      const data = parseJson(text)
      if (!Array.isArray(data)) return { content: withStatus(response, url, formatBody(text, response.headers.get('content-type') ?? '', settings.maxOutputChars)) }
      const heading = `${owner}/${repo} · ${kind} · state=${state}${labels === undefined || kind !== 'issues' ? '' : ` · labels=${labels}`} · ${data.length} returned`
      const lines = [heading, '']
      for (const item of data) {
        const labelNames = Array.isArray(item.labels) ? item.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter((label) => typeof label === 'string') : []
        lines.push(`- #${item.number} [${item.state}]${item.pull_request === undefined ? '' : ' (pull request)'} ${item.title}`)
        lines.push(`  ${item.html_url} · ${item.comments ?? 0} comments · updated ${item.updated_at ?? 'n/a'}${labelNames.length === 0 ? '' : ` · labels: ${labelNames.join(', ')}`}`)
      }
      return { content: withStatus(response, url, truncate(lines.join('\n'), settings.maxOutputChars)) }
    },
  })
}

/** Split a PEM bundle into its individual certificates. */
function parsePemCertificates(pem) {
  return pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu) ?? []
}

/** Compare certificates ignoring whitespace, which PEM encoders vary. */
function normalizePem(pem) {
  return pem.replace(/\s+/gu, '')
}

/**
 * Add the certificates named by `caFile` to this process's default trust store.
 *
 * A local TLS-intercepting accelerator (hosts entries pointing GitHub at
 * 127.0.0.1) is trusted by Windows but not by Node, which ships its own root
 * list; without its CA every request fails with
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Extending the default list here is the
 * runtime equivalent of `NODE_EXTRA_CA_CERTS`, and is a no-op once the
 * certificates are already trusted, so a hot reload cannot grow the list.
 *
 * @param settings - resolved plugin settings.
 * @param ctx - plugin context used for diagnostics only.
 */
function trustConfiguredCertificates(settings, ctx) {
  const caFile = settings.caFile
  if (caFile === undefined) return undefined
  const path = isAbsolute(caFile) ? caFile : resolve(MODULE_DIR, caFile)
  /** Report a failed attempt both to the log and to the next request error. */
  const failed = (reason) => {
    const note = `caFile ${path} was not applied: ${reason}`
    ctx.logger?.warn?.(`github-connector: ${note}`)
    return note
  }
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    return failed(`this runtime has no tls.setDefaultCACertificates (Node ${process.version}); start DeepSeek Harness with NODE_EXTRA_CA_CERTS=${path} instead`)
  }
  let certificates
  try {
    certificates = parsePemCertificates(readFileSync(path, 'utf8'))
  } catch (error) {
    return failed(`the file could not be read — ${error?.message ?? String(error)}`)
  }
  if (certificates.length === 0) return failed('the file holds no PEM CERTIFICATE block')
  const current = tls.getCACertificates('default')
  const known = new Set(current.map(normalizePem))
  const missing = certificates.filter((certificate) => !known.has(normalizePem(certificate)))
  if (missing.length === 0) {
    ctx.logger?.info?.(`github-connector: the ${certificates.length} certificate(s) in ${path} are already trusted`)
    return undefined
  }
  tls.setDefaultCACertificates([...current, ...missing])
  ctx.logger?.info?.(`github-connector: added ${missing.length} certificate(s) from ${path} to this process's trusted CAs`)
  return undefined
}

/**
 * Register the read-only GitHub tools.
 *
 * @param ctx - context whose `tools` registry receives the registrations.
 * @param config - the loader row's config: `tokenEnv`, `apiBaseUrl`,
 *   `timeoutMs`, `maxOutputChars`, and `caFile`.
 */
export function apply(ctx, config) {
  const base = readConfig(config)
  const trustNote = trustConfiguredCertificates(base, ctx)
  const settings = trustNote === undefined ? base : { ...base, trustNote }
  ctx.tools.register(githubApiTool(ctx, settings))
  ctx.tools.register(githubSearchTool(ctx, settings))
  ctx.tools.register(githubFileTool(ctx, settings))
  ctx.tools.register(githubIssuesTool(ctx, settings))
  ctx.logger?.info?.(`github-connector: 4 read-only GitHub tools registered (token reference: ${tokenEnvNames(settings.tokenEnv).join(' / ')})`)
}

