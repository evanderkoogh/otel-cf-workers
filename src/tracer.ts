import {
	Tracer,
	TraceFlags,
	Span,
	SpanKind,
	SpanOptions,
	Context,
	context as api_context,
	trace,
} from '@opentelemetry/api'
import { sanitizeAttributes } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor, RandomIdGenerator, ReadableSpan } from '@opentelemetry/sdk-trace-base'

import { SpanImpl } from './span'

export class WorkerTracer implements Tracer {
	private readonly _spanProcessor: SpanProcessor
	private readonly resource: Resource
	private readonly idGenerator: RandomIdGenerator = new RandomIdGenerator()
	constructor(spanProcessor: SpanProcessor, resource: Resource) {
		this._spanProcessor = spanProcessor
		this.resource = resource
	}

	get spanProcessor() {
		return this._spanProcessor
	}

	addToResource(extra: Resource) {
		this.resource.merge(extra)
	}

	startSpan(name: string, options: SpanOptions = {}, context = api_context.active()): Span {
		if (options.root) {
			context = trace.deleteSpan(context)
		}
		const parentSpan = trace.getSpan(context)
		const parentSpanContext = parentSpan?.spanContext()
		const hasParentContext = parentSpanContext && trace.isSpanContextValid(parentSpanContext)

		const spanId = this.idGenerator.generateSpanId()
		const traceId = hasParentContext ? parentSpanContext.traceId : this.idGenerator.generateTraceId()
		const parentSpanId = hasParentContext ? parentSpanContext.spanId : undefined
		const traceState = hasParentContext ? parentSpanContext.traceState : undefined
		const traceFlags = hasParentContext ? parentSpanContext.traceFlags : TraceFlags.SAMPLED
		const spanContext = { traceId, spanId, traceFlags, traceState }
		const spanKind = options.kind || SpanKind.INTERNAL
		const attributes = sanitizeAttributes(options.attributes)
		const span = new SpanImpl({
			attributes,
			name,
			onEnd: (span) => {
				this.spanProcessor.onEnd(span as unknown as ReadableSpan)
			},
			resource: this.resource,
			spanContext,
			parentSpanId,
			spanKind,
			startTime: options.startTime,
		})
		//Do not get me started on the idosyncracies of the Otel JS libraries.
		//@ts-ignore
		this.spanProcessor.onStart(span, context)
		return span
	}

	startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, options: SpanOptions, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: Span) => ReturnType<F>>(
		name: string,
		options: SpanOptions,
		context: Context,
		fn: F
	): ReturnType<F>
	startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, ...args: unknown[]): ReturnType<F> {
		const options = args.length > 1 ? (args[0] as SpanOptions) : undefined
		const parentContext = args.length > 2 ? (args[1] as Context) : api_context.active()
		const fn = args[args.length - 1] as F

		const span = this.startSpan(name, options, parentContext)
		const contextWithSpanSet = trace.setSpan(parentContext, span)

		return api_context.with(contextWithSpanSet, fn, undefined, span)
	}
}
