import { context } from '@opentelemetry/api'
import {
	ExporterConfig,
	isSpanProcessorConfig,
	ParentRatioSamplingConfig,
	ResolvedTraceConfig,
	TraceConfig,
	Trigger,
} from './types.js'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { AlwaysOnSampler, RandomIdGenerator, ReadableSpan, Sampler, SpanExporter } from '@opentelemetry/sdk-trace-base'

import { OTLPExporter } from './exporter.js'
import { multiTailSampler, isHeadSampled, isRootErrorSpan, createSampler } from './sampling.js'
import { BatchTraceSpanProcessor } from './spanprocessor.js'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig

export function setConfig(config: ResolvedTraceConfig, ctx = context.active()) {
	return ctx.setValue(configSymbol, config)
}

export function getActiveConfig(): ResolvedTraceConfig | undefined {
	const config = context.active().getValue(configSymbol) as ResolvedTraceConfig
	return config || undefined
}

function isSpanExporter(exporterConfig: ExporterConfig): exporterConfig is SpanExporter {
	return !!(exporterConfig as SpanExporter).export
}

function isSampler(sampler: Sampler | ParentRatioSamplingConfig): sampler is Sampler {
	return !!(sampler as Sampler).shouldSample
}

export function parseConfig(supplied: TraceConfig): ResolvedTraceConfig {
	if (isSpanProcessorConfig(supplied)) {
		const headSampleConf = supplied.sampling?.headSampler
		const headSampler = headSampleConf
			? isSampler(headSampleConf)
				? headSampleConf
				: createSampler(headSampleConf)
			: new AlwaysOnSampler()
		const spanProcessors = Array.isArray(supplied.spanProcessors) ? supplied.spanProcessors : [supplied.spanProcessors]
		if (spanProcessors.length === 0) {
			console.log(
				'Warning! You must either specify an exporter or your own SpanProcessor(s)/Exporter combination in the open-telemetry configuration.',
			)
		}
		return {
			fetch: {
				includeTraceContext: supplied.fetch?.includeTraceContext ?? true,
			},
			handlers: {
				fetch: {
					acceptTraceContext: supplied.handlers?.fetch?.acceptTraceContext ?? true,
				},
			},
			postProcessor: supplied.postProcessor || ((spans: ReadableSpan[]) => spans),
			sampling: {
				headSampler,
				tailSampler: supplied.sampling?.tailSampler || multiTailSampler([isHeadSampled, isRootErrorSpan]),
			},
			service: supplied.service,
			spanProcessors,
			propagator: supplied.propagator || new W3CTraceContextPropagator(),
			instrumentation: {
				instrumentGlobalCache: supplied.instrumentation?.instrumentGlobalCache ?? true,
				instrumentGlobalFetch: supplied.instrumentation?.instrumentGlobalFetch ?? true,
			},
			idGenerator: supplied.idGenerator || new RandomIdGenerator(),
		}
	} else {
		const exporter = isSpanExporter(supplied.exporter) ? supplied.exporter : new OTLPExporter(supplied.exporter)
		const spanProcessors = [new BatchTraceSpanProcessor(exporter)]
		const newConfig = Object.assign(supplied, { exporter: undefined, spanProcessors }) as TraceConfig
		return parseConfig(newConfig)
	}
}
