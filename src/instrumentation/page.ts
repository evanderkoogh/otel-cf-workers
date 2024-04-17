import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { Initialiser, setConfig } from '../config'
import { exportSpans, proxyExecutionContext } from './common'
import { Exception, SpanKind, SpanOptions, SpanStatusCode, context as api_context, trace } from '@opentelemetry/api'
import { wrap } from '../wrap'
import {
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
	getParentContextFromRequest,
} from './fetch'

type PageHandlerArgs = Parameters<PagesFunction>

let cold_start = true
export function executePageHandler(pagesFn: PagesFunction, [request]: PageHandlerArgs): Promise<Response> {
	const spanContext = getParentContextFromRequest(request.request)

	const tracer = trace.getTracer('pagesHandler')
	const attributes = {
		['faas.trigger']: 'http',
		['faas.coldstart']: cold_start,
		['faas.invocation_id']: request.request.headers.get('cf-ray') ?? undefined,
	}
	cold_start = false
	Object.assign(attributes, gatherRequestAttributes(request.request))
	Object.assign(attributes, gatherIncomingCfAttributes(request.request))
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const promise = tracer.startActiveSpan(
		`${request.request.method} ${request.functionPath}`,
		options,
		spanContext,
		async (span) => {
			const readable = span as unknown as ReadableSpan
			try {
				const response: Response = await pagesFn(request)
				span.setAttributes(gatherResponseAttributes(response))
				if (readable.attributes['http.route']) {
					span.updateName(`${request.request.method} ${readable.attributes['http.route']}`)
				}
				span.end()

				return response
			} catch (error) {
				if (readable.attributes['http.route']) {
					span.updateName(`${request.request.method} ${readable.attributes['http.route']}`)
				}
				span.recordException(error as Exception)
				span.setStatus({ code: SpanStatusCode.ERROR })
				span.end()
				throw error
			}
		},
	)
	return promise
}

export function createPageHandler<
	E = unknown,
	P extends string = any,
	D extends Record<string, unknown> = Record<string, unknown>,
>(pageFn: PagesFunction<E, P, D>, initialiser: Initialiser): PagesFunction<E, P, D> {
	const pagesHandler: ProxyHandler<PagesFunction> = {
		apply: async (target, _thisArg, argArray: Parameters<PagesFunction>): Promise<Response> => {
			const [orig_ctx] = argArray
			const config = initialiser(orig_ctx.env as Record<string, unknown>, orig_ctx.request)
			const { ctx, tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				const args: PageHandlerArgs = [ctx] as PageHandlerArgs
				return await api_context.with(context, executePageHandler, undefined, target, args)
			} catch (error) {
				throw error
			} finally {
				orig_ctx.waitUntil(exportSpans(tracker))
			}
		},
	}
	return wrap(pageFn, pagesHandler)
}
