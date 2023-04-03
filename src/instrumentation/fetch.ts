import { trace, SpanOptions, SpanKind, propagation, context, Attributes, Exception, Context } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { extractConfigFromEnv, init } from '../config'
import { WorkerTraceConfig } from '../config'
import { instrumentEnv } from './env'

type FetchHandler<E, C> = ExportedHandlerFetchHandler<E, C>

const sanitiseURL = (url: string): string => {
	const u = new URL(url)
	return `${u.protocol}//${u.host}${u.pathname}${u.search}`
}

const gatherRequestAttributes = (request: Request): Attributes => {
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

const gatherIncomingCfAttributes = (request: Request): Attributes => {
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

const gatherResponseAttributes = (response: Response): Attributes => {
	const attrs: Record<string, string | number> = {}
	attrs[SemanticAttributes.HTTP_STATUS_CODE] = response.status
	attrs[SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH] = response.headers.get('content-length')!
	attrs['http.response_content-type'] = response.headers.get('content-type')!
	return attrs
}

const getCurrentSpanContext = (headers: Headers): Context => {
	return propagation.extract(context.active(), headers, {
		get(headers, key) {
			return headers.get(key) || undefined
		},
		keys(headers) {
			return [...headers.keys()]
		},
	})
}

let cold_start = true
const instrumentFetchHandler = <E, C>(
	fetchHandler: FetchHandler<E, C>,
	config: WorkerTraceConfig
): FetchHandler<E, C> => {
	return new Proxy(fetchHandler, {
		apply: (target, thisArg, argArray): Promise<Response> => {
			const request = argArray[0] as Request
			const env = argArray[1] as Record<string, unknown>
			extractConfigFromEnv(config, env)
			init(config)
			argArray[1] = instrumentEnv(env, config)

			const spanContext = getCurrentSpanContext(request.headers)

			const tracer = trace.getTracer('fetchHandler')
			const options: SpanOptions = { kind: SpanKind.SERVER }

			const promise = tracer.startActiveSpan('fetchHandler', options, spanContext, async (span) => {
				span.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'http')
				span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
				cold_start = false

				span.setAttributes(gatherRequestAttributes(request))
				span.setAttributes(gatherIncomingCfAttributes(request))

				try {
					const response: Response = await Reflect.apply(target, thisArg, argArray)
					span.setAttributes(gatherResponseAttributes(response))
					span.end()

					return response
				} catch (error) {
					span.recordException(error as Exception)
					span.end()
					return new Response('Server error.', { status: 500 })
				}
			})
			return promise
		},
	})
}

const instrumentGlobalFetch = (): void => {
	if (!globalThis.orig_fetch) {
		globalThis.orig_fetch = globalThis.fetch
		const new_fetch = new Proxy(globalThis.fetch, {
			apply: (target, thisArg, argArray): ReturnType<typeof fetch> => {
				const tracer = trace.getTracer('fetch')
				const options: SpanOptions = { kind: SpanKind.CLIENT }

				const request = new Request(argArray[0], argArray[1])
				const host = new URL(request.url).host
				const promise = tracer.startActiveSpan(`fetch: ${host}`, options, async (span) => {
					propagation.inject(context.active(), request.headers, {
						set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
					})
					span.setAttributes(gatherRequestAttributes(request))
					if (request.cf) span.setAttributes(gatherOutgoingCfAttributes(request.cf))
					const response: Response = await Reflect.apply(target, thisArg, [request])
					span.setAttributes(gatherResponseAttributes(response))
					span.end()
					return response
				})
				return promise
			},
		})
		globalThis.fetch = new_fetch
	}
}

export { instrumentGlobalFetch, instrumentFetchHandler }
