import {
	trace,
	SpanOptions,
	SpanKind,
	Exception,
	context as api_context,
	SpanStatusCode
} from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { Initialiser, setConfig } from '../config.js'
import { exportSpans, proxyExecutionContext } from './common.js'
import { instrumentEnv } from './env.js'
import { wrap } from '../wrap.js'

type ScheduledHandler = ExportedHandlerScheduledHandler<unknown>
export type ScheduledHandlerArgs = Parameters<ScheduledHandler>

const traceIdSymbol = Symbol('traceId')

let cold_start = true
export function executeScheduledHandler(scheduledFn: ScheduledHandler, [controller, env, ctx]: ScheduledHandlerArgs): Promise<void> {
	const tracer = trace.getTracer('scheduledHandler')
	const attributes = {
		[SemanticAttributes.FAAS_TRIGGER]: 'timer',
		[SemanticAttributes.FAAS_COLDSTART]: cold_start,
		[SemanticAttributes.FAAS_CRON]: controller.cron,
		[SemanticAttributes.FAAS_TIME]: new Date(controller.scheduledTime).toISOString()
	}
	cold_start = false
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const promise = tracer.startActiveSpan('scheduledHandler', options, async (span) => {
		const traceId = span.spanContext().traceId
		api_context.active().setValue(traceIdSymbol, traceId)
		try {
			await scheduledFn(controller, env, ctx)
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
		}
	})
	return promise
}

export function createScheduledHandler(scheduledFn: ScheduledHandler, initialiser: Initialiser) {
	const scheduledHandler: ProxyHandler<ScheduledHandler> = {
		async apply(target, _thisArg, argArray: Parameters<ScheduledHandler>): Promise<void> {
			const [controller, orig_env, orig_ctx] = argArray
			const config = initialiser(orig_env as Record<string, unknown>, controller)
			const env = instrumentEnv(orig_env as Record<string, unknown>)
			const { ctx, tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				const args: ScheduledHandlerArgs = [controller, env, ctx]

				return await api_context.with(context, executeScheduledHandler, undefined, target, args)
			} catch (error) {
				throw error
			} finally {
				orig_ctx.waitUntil(exportSpans(tracker))
			}
		},
	}
	return wrap(scheduledFn, scheduledHandler)
}
