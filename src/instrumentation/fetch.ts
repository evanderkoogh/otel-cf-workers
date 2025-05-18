import {
	trace,
	SpanOptions,
	SpanKind,
	propagation,
	context as api_context,
	Attributes,
	Context,
	Span,
	Exception,
	SpanStatusCode,
} from '@opentelemetry/api'
import { getActiveConfig } from '../config.js'
import { wrap } from '../wrap.js'
import { HandlerInstrumentation, OrPromise, ResolvedTraceConfig } from '../types.js'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'

type IncomingRequest = Parameters<ExportedHandlerFetchHandler>[0]

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
	const attrs: Record<string, string | number> = {}
	const headers = request.headers
	attrs['http.request.method'] = request.method.toUpperCase()
	attrs['network.protocol.name'] = 'http'
	attrs['network.protocol.version'] = request.cf?.httpProtocol as string
	attrs['http.request.body.size'] = headers.get('content-length')!
	attrs['user_agent.original'] = headers.get('user-agent')!
	attrs['http.mime_type'] = headers.get('content-type')!
	attrs['http.accepts'] = request.cf?.clientAcceptEncoding as string

	const u = new URL(request.url)
	attrs['url.full'] = `${u.protocol}//${u.host}${u.pathname}${u.search}`
	attrs['server.address'] = u.host
	attrs['url.scheme'] = u.protocol
	attrs['url.path'] = u.pathname
	attrs['url.query'] = u.search

	return attrs
}

export function gatherResponseAttributes(response: Response): Attributes {
	const attrs: Record<string, string | number> = {}
	attrs['http.response.status_code'] = response.status
	if (response.headers.get('content-length')! == null) {
		attrs['http.response.body.size'] = response.headers.get('content-length')!
	}
	attrs['http.mime_type'] = response.headers.get('content-type')!
	return attrs
}

export function gatherIncomingCfAttributes(request: Request): Attributes {
	const attrs: Record<string, string | number> = {}
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

	if (workerConfig === undefined) {
		return api_context.active()
	}

	const acceptTraceContext =
		typeof workerConfig.handlers.fetch.acceptTraceContext === 'function'
			? workerConfig.handlers.fetch.acceptTraceContext(request)
			: (workerConfig.handlers.fetch.acceptTraceContext ?? true)
	return acceptTraceContext ? getParentContextFromHeaders(request.headers) : api_context.active()
}

function updateSpanNameOnRoute(span: Span, request: IncomingRequest) {
	const readable = span as unknown as ReadableSpan
	if (readable.attributes['http.route']) {
		const method = request.method.toUpperCase()
		span.updateName(`${method} ${readable.attributes['http.route']}`)
	}
}

export const fetchInstrumentation: HandlerInstrumentation<IncomingRequest, OrPromise<Response>> = {
	getInitialSpanInfo: (request) => {
		const spanContext = getParentContextFromRequest(request)
		const attributes = {
			['faas.trigger']: 'http',
			['faas.invocation_id']: request.headers.get('cf-ray') ?? undefined,
		}
		Object.assign(attributes, gatherRequestAttributes(request))
		Object.assign(attributes, gatherIncomingCfAttributes(request))
		const method = request.method.toUpperCase()
		return {
			name: `fetchHandler ${method}`,
			options: {
				attributes,
				kind: SpanKind.SERVER,
			},
			context: spanContext,
		}
	},
	getAttributesFromResult: (response) => {
		return gatherResponseAttributes(response)
	},
	executionSucces: updateSpanNameOnRoute,
	executionFailed: updateSpanNameOnRoute,
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
				try {
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
					return response
				} catch (error: unknown) {
					span.recordException(error as Exception)
					span.setStatus({ code: SpanStatusCode.ERROR })
					throw error
				} finally {
					span.end()
				}
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
