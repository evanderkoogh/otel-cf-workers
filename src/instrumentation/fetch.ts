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
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { Initialiser, getActiveConfig, setConfig } from '../config.js'
import { wrap } from '../wrap.js'
import { instrumentEnv } from './env.js'
import { exportSpans, proxyExecutionContext } from './common.js'
import { ResolvedTraceConfig } from '../types.js'

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

export function sanitiseURL(url: string): string {
	const u = new URL(url)
	return `${u.protocol}//${u.host}${u.pathname}${u.search}`
}

const gatherOutgoingCfAttributes = (cf: RequestInitCfProperties): Attributes => {
	const attrs: Record<string, string | number> = {}
	Object.keys(cf).forEach((key) => {
		const value = cf[key]
		if (typeof value === 'string' || typeof value === 'number') {
			attrs[`cf.${key}`] = value
		} else {
			attrs[`cf.${key}`] = JSON.stringify(value)
		}
	})
	return attrs
}

export function gatherRequestAttributes(request: Request): Attributes {
	const attrs: Record<string, string | number> = {}
	const headers = request.headers
	// attrs[SemanticAttributes.HTTP_CLIENT_IP] = '1.1.1.1'
	attrs[SemanticAttributes.HTTP_METHOD] = request.method
	attrs[SemanticAttributes.HTTP_URL] = sanitiseURL(request.url)
	attrs[SemanticAttributes.HTTP_USER_AGENT] = headers.get('user-agent')!
	attrs[SemanticAttributes.HTTP_REQUEST_CONTENT_LENGTH] = headers.get('content-length')!
	attrs['http.request_content-type'] = headers.get('content-type')!
	attrs['http.accepts'] = headers.get('accepts')!
	return attrs
}

export function gatherResponseAttributes(response: Response): Attributes {
	const attrs: Record<string, string | number> = {}
	attrs[SemanticAttributes.HTTP_STATUS_CODE] = response.status
	attrs[SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH] = response.headers.get('content-length')!
	attrs['http.response_content-type'] = response.headers.get('content-type')!
	return attrs
}

export function gatherIncomingCfAttributes(request: Request): Attributes {
	const attrs: Record<string, string | number> = {}
	attrs[SemanticAttributes.HTTP_SCHEME] = request.cf?.httpProtocol as string
	attrs['net.colo'] = request.cf?.colo as string
	attrs['net.country'] = request.cf?.country as string
	attrs['net.request_priority'] = request.cf?.requestPriority as string
	attrs['net.tls_cipher'] = request.cf?.tlsCipher as string
	attrs['net.tls_version'] = request.cf?.tlsVersion as string
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
	const acceptTraceContext =
		typeof workerConfig.handlers.fetch.acceptTraceContext === 'function'
			? workerConfig.handlers.fetch.acceptTraceContext(request)
			: workerConfig.handlers.fetch.acceptTraceContext ?? true
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
		[SemanticAttributes.FAAS_TRIGGER]: 'http',
		[SemanticAttributes.FAAS_COLDSTART]: cold_start,
		[SemanticAttributes.FAAS_EXECUTION]: request.headers.get('cf-ray') ?? undefined,
	}
	cold_start = false
	Object.assign(attributes, gatherRequestAttributes(request))
	Object.assign(attributes, gatherIncomingCfAttributes(request))
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const promise = tracer.startActiveSpan('fetchHandler', options, spanContext, async (span) => {
		try {
			const response: Response = await fetchFn(request, env, ctx)
			if (response.status < 500) {
				span.setStatus({ code: SpanStatusCode.OK })
			}
			span.setAttributes(gatherResponseAttributes(response))
			span.end()

			return response
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
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
export function instrumentFetcher(
	fetchFn: Fetcher['fetch'],
	configFn: getFetchConfig,
	attrs?: Attributes
): Fetcher['fetch'] {
	const handler: ProxyHandler<typeof fetch> = {
		apply: (target, thisArg, argArray): ReturnType<typeof fetch> => {
			const workerConfig = getActiveConfig()
			const config = configFn(workerConfig)
			const request = new Request(argArray[0], argArray[1])

			const tracer = trace.getTracer('fetcher')
			const options: SpanOptions = { kind: SpanKind.CLIENT, attributes: attrs }

			const host = new URL(request.url).host
			const spanName = typeof attrs?.['name'] === 'string' ? attrs?.['name'] : `fetch: ${host}`
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
				const response: Response = await Reflect.apply(target, thisArg, [request])
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
	globalThis.fetch = instrumentFetcher(globalThis.fetch, (config) => config.fetch)
}
