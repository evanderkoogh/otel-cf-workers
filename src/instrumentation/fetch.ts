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
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { loadConfig, init, PartialTraceConfig } from '../config'
import { gatherRequestAttributes, gatherResponseAttributes } from './common'
import { instrumentEnv } from './env'

type FetchHandler<E, C> = ExportedHandlerFetchHandler<E, C>

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

class PromiseTracker {
	_outstandingPromises: Promise<unknown>[] = []

	get outstandingPromiseCount() {
		return this._outstandingPromises.length
	}

	track(promise: Promise<unknown>): void {
		this._outstandingPromises.push(promise)
	}

	async wait() {
		await Promise.all(this._outstandingPromises)
	}
}

type ContextAndTracker = { ctx: ExecutionContext; tracker: PromiseTracker }

const proxyExecutionContext = (context: ExecutionContext): ContextAndTracker => {
	const tracker = new PromiseTracker()
	const ctx = new Proxy(context, {
		get(target, prop) {
			if (prop === 'waitUntil') {
				const fn = Reflect.get(target, prop)
				return new Proxy(fn, {
					apply(target, thisArg, argArray) {
						tracker.track(argArray[0])
						return Reflect.apply(target, context, argArray)
					},
				})
			}
		},
	})
	return { ctx, tracker }
}

const exportSpans = async (tracker: PromiseTracker, spanProcessor: SpanProcessor) => {
	await scheduler.wait(1)
	await tracker.wait()
	await spanProcessor.forceFlush()
}

let cold_start = true
const instrumentFetchHandler = <E, C>(
	fetchHandler: FetchHandler<E, C>,
	conf: PartialTraceConfig
): FetchHandler<E, C> => {
	return new Proxy(fetchHandler, {
		apply: (target, thisArg, argArray): Promise<Response> => {
			const request = argArray[0] as Request
			const env = argArray[1] as Record<string, unknown>
			const config = loadConfig(conf, env)
			const spanProcessor = init(config)
			argArray[1] = instrumentEnv(env, config.bindings)
			const originalCtx = argArray[2] as ExecutionContext
			const { ctx, tracker } = proxyExecutionContext(originalCtx)
			argArray[2] = ctx

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
					const response: Response = await Reflect.apply(target, thisArg, argArray)
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
				} finally {
					originalCtx.waitUntil(exportSpans(tracker, spanProcessor))
				}
			})
			return promise
		},
	})
}

export { instrumentFetchHandler }
