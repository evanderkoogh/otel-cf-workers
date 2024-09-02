import {
	trace,
	SpanOptions,
	SpanKind,
	propagation,
	context as api_context,
	Attributes,
	Exception,
	Context,
	SpanStatusCode,
} from '@opentelemetry/api'
import {
	ATTR_HTTP_REQUEST_HEADER,
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_NETWORK_PROTOCOL_NAME,
	ATTR_SERVER_ADDRESS,
	ATTR_SERVER_PORT,
	ATTR_URL_FULL,
	ATTR_URL_PATH,
	ATTR_URL_QUERY,
	ATTR_URL_SCHEME,
	ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions/'
import {
	ATTR_FAAS_COLDSTART,
	ATTR_FAAS_INVOCATION_ID,
	ATTR_FAAS_TRIGGER,
	ATTR_TLS_CIPHER,
	ATTR_TLS_PROTOCOL_VERSION,
	ATTR_URL_DOMAIN,
	FAAS_TRIGGER_VALUE_HTTP,
} from '@opentelemetry/semantic-conventions/incubating'

import { Initialiser, getActiveConfig, setConfig } from '../config.js'
import { wrap } from '../wrap.js'
import { instrumentEnv } from './env.js'
import { exportSpans, proxyExecutionContext } from './common.js'
import { ResolvedTraceConfig } from '../types.js'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { versionAttributes } from './version.js'

export type IncludeTraceContextFn = (request: Request) => boolean
export interface FetcherConfig {
	includeTraceContext?: boolean | IncludeTraceContextFn
}

export type AcceptTraceContextFn = (request: Request) => boolean
export interface FetchHandlerConfig {
	/**
	 * Whether to enable context propagation for incoming requests to `fetch`.
	 * This enables or disables distributed tracing from W3C Trace Context headers.
	 * @default true
	 */
	acceptTraceContext?: boolean | AcceptTraceContextFn
}

type FetchHandler = ExportedHandlerFetchHandler
type FetchHandlerArgs = Parameters<FetchHandler>

const netKeysFromCF = new Set(['colo', 'country', 'request_priority', 'tls_cipher', 'tls_version', 'asn', 'tcp_rtt'])

const camelToSnakeCase = (s: string): string => {
	return s.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

const gatherOutgoingCfAttributes = (cf: RequestInitCfProperties): Attributes => {
	const attrs: Record<string, string | number> = {}
	Object.keys(cf).forEach((key) => {
		const value = cf[key]
		const destKey = camelToSnakeCase(key)
		if (!netKeysFromCF.has(destKey)) {
			if (typeof value === 'string' || typeof value === 'number') {
				attrs[`cf.${destKey}`] = value
			} else {
				attrs[`cf.${destKey}`] = JSON.stringify(value)
			}
		}
	})
	return attrs
}

export function gatherRequestAttributes(request: Request): Attributes {
	const headers = request.headers
	const u = new URL(request.url)
	const attrs: Record<string, string | number> = {
		[ATTR_NETWORK_PROTOCOL_NAME]: 'http',
		[ATTR_HTTP_REQUEST_METHOD]: request.method.toUpperCase(),
		[ATTR_URL_FULL]: `${u.protocol}//${u.host}${u.pathname}${u.search}`,
		[ATTR_URL_SCHEME]: u.protocol,
		[ATTR_URL_DOMAIN]: u.host,
		[ATTR_SERVER_ADDRESS]: u.host,
		[ATTR_URL_PATH]: u.pathname,
		[ATTR_URL_QUERY]: u.search,
		[ATTR_USER_AGENT_ORIGINAL]: headers.get('user-agent')!,
	}
	const port = u.port || u.protocol === 'https' ? 443 : 80
	attrs[ATTR_SERVER_PORT] = port
	attrs[`${ATTR_HTTP_REQUEST_HEADER}.accepts`] = headers.get('accepts')!
	attrs[`${ATTR_HTTP_REQUEST_HEADER}.content-length`] = headers.get('content-length')!

	return attrs
}

export function gatherResponseAttributes(response: Response): Attributes {
	const attrs: Record<string, string | number> = {
		[ATTR_HTTP_RESPONSE_STATUS_CODE]: response.status,
	}
	attrs[`${ATTR_HTTP_REQUEST_HEADER}.mime-type`] = response.headers.get('mime-type')!
	return attrs
}

export function gatherIncomingCfAttributes(request: Request): Attributes {
	const attrs: Record<string, string | number> = {}
	attrs['net.colo'] = request.cf?.colo as string
	attrs['net.country'] = request.cf?.country as string
	attrs['net.request_priority'] = request.cf?.requestPriority as string
	attrs[ATTR_TLS_CIPHER] = request.cf?.tlsCipher as string
	attrs[ATTR_TLS_PROTOCOL_VERSION] = request.cf?.tlsVersion as string
	attrs['net.asn'] = request.cf?.asn as number
	attrs['net.tcp_rtt'] = request.cf?.clientTcpRtt as number
	return attrs
}

export function getParentContextFromHeaders(headers: Headers): Context {
	return propagation.extract(api_context.active(), headers, {
		get(headers, key) {
			return headers.get(key) || undefined
		},
		keys(headers) {
			return [...headers.keys()]
		},
	})
}

function getParentContextFromRequest(request: Request) {
	const workerConfig = getActiveConfig()

	if (workerConfig === undefined) {
		return api_context.active()
	}

	const acceptTraceContext =
		typeof workerConfig.handlers.fetch.acceptTraceContext === 'function'
			? workerConfig.handlers.fetch.acceptTraceContext(request)
			: (workerConfig.handlers.fetch.acceptTraceContext ?? true)
	return acceptTraceContext ? getParentContextFromHeaders(request.headers) : api_context.active()
}

export function waitUntilTrace(fn: () => Promise<any>): Promise<void> {
	const tracer = trace.getTracer('waitUntil')
	return tracer.startActiveSpan('waitUntil', async (span) => {
		await fn()
		span.end()
	})
}

let cold_start = true
export function executeFetchHandler(fetchFn: FetchHandler, [request, env, ctx]: FetchHandlerArgs): Promise<Response> {
	const spanContext = getParentContextFromRequest(request)

	const tracer = trace.getTracer('fetchHandler')
	const attributes = {
		[ATTR_FAAS_TRIGGER]: FAAS_TRIGGER_VALUE_HTTP,
		[ATTR_FAAS_COLDSTART]: cold_start,
		[ATTR_FAAS_INVOCATION_ID]: request.headers.get('cf-ray') ?? undefined,
	}
	cold_start = false
	Object.assign(attributes, gatherRequestAttributes(request))
	Object.assign(attributes, gatherIncomingCfAttributes(request))
	Object.assign(attributes, versionAttributes(env))
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const method = request.method.toUpperCase()
	const promise = tracer.startActiveSpan(`fetchHandler ${method}`, options, spanContext, async (span) => {
		const readable = span as unknown as ReadableSpan
		try {
			const response = await fetchFn(request, env, ctx)
			span.setAttributes(gatherResponseAttributes(response))

			return response
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			throw error
		} finally {
			if (readable.attributes['http.route']) {
				span.updateName(`${method} ${readable.attributes['http.route']}`)
			}
			span.end()
		}
	})
	return promise
}

export function createFetchHandler(fetchFn: FetchHandler, initialiser: Initialiser) {
	const fetchHandler: ProxyHandler<FetchHandler> = {
		apply: async (target, _thisArg, argArray: Parameters<FetchHandler>): Promise<Response> => {
			const [request, orig_env, orig_ctx] = argArray
			const config = initialiser(orig_env as Record<string, unknown>, request)
			const env = instrumentEnv(orig_env as Record<string, unknown>)
			const { ctx, tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				const args: FetchHandlerArgs = [request, env, ctx]
				return await api_context.with(context, executeFetchHandler, undefined, target, args)
			} catch (error) {
				throw error
			} finally {
				orig_ctx.waitUntil(exportSpans(tracker))
			}
		},
	}
	return wrap(fetchFn, fetchHandler)
}

type getFetchConfig = (config: ResolvedTraceConfig) => FetcherConfig
export function instrumentClientFetch(
	fetchFn: Fetcher['fetch'],
	configFn: getFetchConfig,
	attrs?: Attributes,
): Fetcher['fetch'] {
	const handler: ProxyHandler<Fetcher['fetch']> = {
		apply: (target, thisArg, argArray): Response | Promise<Response> => {
			const request = new Request(argArray[0], argArray[1])
			if (!request.url.startsWith('http')) {
				return Reflect.apply(target, thisArg, argArray)
			}

			const workerConfig = getActiveConfig()
			if (!workerConfig) {
				return Reflect.apply(target, thisArg, [request])
			}
			const config = configFn(workerConfig)

			const tracer = trace.getTracer('fetcher')
			const options: SpanOptions = { kind: SpanKind.CLIENT, attributes: attrs }

			const host = new URL(request.url).host
			const method = request.method.toUpperCase()
			const spanName = typeof attrs?.['name'] === 'string' ? attrs?.['name'] : `fetch ${method} ${host}`
			const promise = tracer.startActiveSpan(spanName, options, async (span) => {
				const includeTraceContext =
					typeof config.includeTraceContext === 'function'
						? config.includeTraceContext(request)
						: config.includeTraceContext
				if (includeTraceContext ?? true) {
					propagation.inject(api_context.active(), request.headers, {
						set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
					})
				}
				span.setAttributes(gatherRequestAttributes(request))
				if (request.cf) span.setAttributes(gatherOutgoingCfAttributes(request.cf))
				const response = await Reflect.apply(target, thisArg, [request])
				span.setAttributes(gatherResponseAttributes(response))
				span.end()
				return response
			})
			return promise
		},
	}
	return wrap(fetchFn, handler, true)
}

export function instrumentGlobalFetch(): void {
	//@ts-ignore For some reason the node types are imported and complain.
	globalThis.fetch = instrumentClientFetch(globalThis.fetch, (config) => config.fetch)
}
