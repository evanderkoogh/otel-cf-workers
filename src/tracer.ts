import * as api from '@opentelemetry/api'
import { Tracer, TraceFlags, SpanKind, SpanOptions, Context } from '@opentelemetry/api'
import { sanitizeAttributes } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor, RandomIdGenerator } from '@opentelemetry/sdk-trace-base'

import { Span } from './span'

export class WorkerTracer implements Tracer {
	private readonly spanProcessor: SpanProcessor
	private readonly resource: Resource
	private readonly idGenerator: RandomIdGenerator = new RandomIdGenerator()
	constructor(spanProcessor: SpanProcessor, resource: Resource) {
		this.spanProcessor = spanProcessor
		this.resource = resource
	}

	addToResource(extra: Resource) {
		this.resource.merge(extra)
	}

	startSpan(name: string, options: api.SpanOptions = {}, context = api.context.active()): api.Span {
		if (options.root) {
			context = api.trace.deleteSpan(context)
		}
		const parentSpan = api.trace.getSpan(context)
		const parentSpanContext = parentSpan?.spanContext()
		const isChildSpan = parentSpanContext && api.trace.isSpanContextValid(parentSpanContext)

		const spanId = this.idGenerator.generateSpanId()
		const traceId = isChildSpan ? parentSpanContext.traceId : this.idGenerator.generateTraceId()
		const parentSpanId = isChildSpan ? parentSpanContext.spanId : undefined
		const traceState = isChildSpan ? parentSpanContext.traceState : undefined
		const traceFlags = TraceFlags.SAMPLED
		const spanContext = { traceId, spanId, traceFlags, traceState }
		const spanKind = options.kind || SpanKind.INTERNAL
		const attributes = sanitizeAttributes(options.attributes)
		return new Span({
			attributes,
			name,
			onEnd: (span) => {
				this.spanProcessor.onEnd(span)
			},
			resource: this.resource,
			spanContext,
			parentSpanId,
			spanKind,
			startTime: options.startTime,
		})
	}

	startActiveSpan<F extends (span: api.Span) => ReturnType<F>>(name: string, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: api.Span) => ReturnType<F>>(name: string, options: SpanOptions, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: api.Span) => ReturnType<F>>(
		name: string,
		options: SpanOptions,
		context: Context,
		fn: F
	): ReturnType<F>
	startActiveSpan<F extends (span: api.Span) => ReturnType<F>>(name: string, ...args: unknown[]): ReturnType<F> {
		const options = args.length > 1 ? (args[0] as SpanOptions) : undefined
		const parentContext = args.length > 2 ? (args[1] as Context) : api.context.active()
		const fn = args[args.length - 1] as F

		const span = this.startSpan(name, options, parentContext)
		const contextWithSpanSet = api.trace.setSpan(parentContext, span)

		return api.context.with(contextWithSpanSet, fn, undefined, span)
	}
}
