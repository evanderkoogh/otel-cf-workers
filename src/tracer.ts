import {
	Attributes,
	Tracer,
	TraceFlags,
	Span,
	SpanKind,
	SpanOptions,
	Context,
	context as api_context,
	trace,
	SpanContext,
} from '@opentelemetry/api'
import { sanitizeAttributes } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor, RandomIdGenerator, ReadableSpan, SamplingDecision } from '@opentelemetry/sdk-trace-base'

import { SpanImpl } from './span.js'
import { getActiveConfig } from './config.js'

enum NewTraceFlags {
	RANDOM_TRACE_ID_SET = 2,
	RANDOM_TRACE_ID_UNSET = 0,
}

type NewTraceFlagValues = NewTraceFlags.RANDOM_TRACE_ID_SET | NewTraceFlags.RANDOM_TRACE_ID_UNSET

const idGenerator: RandomIdGenerator = new RandomIdGenerator()

let withNextSpanAttributes: Attributes

function getFlagAt(flagSequence: number, position: number): number {
	return ((flagSequence >> (position - 1)) & 1) * position
}

export class WorkerTracer implements Tracer {
	private readonly _spanProcessors: SpanProcessor[]
	private readonly resource: Resource
	constructor(spanProcessors: SpanProcessor[], resource: Resource) {
		this._spanProcessors = spanProcessors
		this.resource = resource
	}

	get spanProcessors() {
		return this._spanProcessors
	}

	addToResource(extra: Resource) {
		this.resource.merge(extra)
	}

	startSpan(name: string, options: SpanOptions = {}, context = api_context.active()): Span {
		if (options.root) {
			context = trace.deleteSpan(context)
		}

		const config = getActiveConfig()
		if (!config) throw new Error('Config is undefined. This is a bug in the instrumentation logic')

		const parentSpanContext = trace.getSpan(context)?.spanContext()
		const { traceId, randomTraceFlag } = getTraceInfo(parentSpanContext)

		const spanKind = options.kind || SpanKind.INTERNAL
		const sanitisedAttrs = sanitizeAttributes(options.attributes)

		const sampler = config.sampling.headSampler
		const samplingDecision = sampler.shouldSample(context, traceId, name, spanKind, sanitisedAttrs, [])
		const { decision, traceState, attributes: attrs } = samplingDecision

		const attributes = Object.assign({}, options.attributes, attrs, withNextSpanAttributes)
		withNextSpanAttributes = {}

		const spanId = idGenerator.generateSpanId()
		const parentSpanId = parentSpanContext?.spanId

		const sampleFlag = decision === SamplingDecision.RECORD_AND_SAMPLED ? TraceFlags.SAMPLED : TraceFlags.NONE
		const traceFlags = sampleFlag + randomTraceFlag
		const spanContext = { traceId, spanId, traceFlags, traceState }

		const span = new SpanImpl({
			attributes: sanitizeAttributes(attributes),
			name,
			onEnd: (span) => {
				this.spanProcessors.forEach((sp) => {
					sp.onEnd(span as unknown as ReadableSpan)
				})
			},
			resource: this.resource,
			spanContext,
			parentSpanContext,
			parentSpanId,
			spanKind,
			startTime: options.startTime,
		})
		this.spanProcessors.forEach((sp) => {
			//Do not get me started on the idosyncracies of the Otel JS libraries.
			//@ts-ignore
			sp.onStart(span, context)
		})
		return span
	}

	startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, options: SpanOptions, fn: F): ReturnType<F>
	startActiveSpan<F extends (span: Span) => ReturnType<F>>(
		name: string,
		options: SpanOptions,
		context: Context,
		fn: F,
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

export function withNextSpan(attrs: Attributes) {
	withNextSpanAttributes = Object.assign({}, withNextSpanAttributes, attrs)
}

function getTraceInfo(parentSpanContext?: SpanContext): { traceId: string; randomTraceFlag: NewTraceFlagValues } {
	if (parentSpanContext && trace.isSpanContextValid(parentSpanContext)) {
		const { traceId, traceFlags } = parentSpanContext
		return { traceId, randomTraceFlag: getFlagAt(traceFlags, 2) }
	} else {
		return { traceId: idGenerator.generateTraceId(), randomTraceFlag: NewTraceFlags.RANDOM_TRACE_ID_SET }
	}
}
