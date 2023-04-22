import {
	trace,
	SpanOptions,
	SpanKind,
	propagation,
	context,
	Attributes,
	Exception,
	Context,
	SpanStatusCode,
} from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'

type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
export type FetchHandlerArgs = Parameters<FetchHandler>

export function sanitiseURL(url: string): string {
	const u = new URL(url)
	return `${u.protocol}//${u.host}${u.pathname}${u.search}`
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
	return propagation.extract(context.active(), headers, {
		get(headers, key) {
			return headers.get(key) || undefined
		},
		keys(headers) {
			return [...headers.keys()]
		},
	})
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
	const spanContext = getParentContextFromHeaders(request.headers)

	const tracer = trace.getTracer('fetchHandler')
	const options: SpanOptions = { kind: SpanKind.SERVER }

	const promise = tracer.startActiveSpan('fetchHandler', options, spanContext, async (span) => {
		span.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'http')
		span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
		cold_start = false

		span.setAttributes(gatherRequestAttributes(request))
		span.setAttributes(gatherIncomingCfAttributes(request))

		try {
			const response: Response = await fetchFn(request, env, ctx)
			if (response.ok) {
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
