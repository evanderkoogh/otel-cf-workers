import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPExporterConfig } from './exporter'
import { FetcherConfig } from './instrumentation/fetch'
import { TailSampleFn } from './sampling'

export type PostProcessorFn = (spans: ReadableSpan[]) => ReadableSpan[]

export type ExporterConfig = OTLPExporterConfig | SpanExporter

export interface GlobalsConfig {
	fetch?: FetcherConfig
}

export interface ServiceConfig {
	name: string
	namespace?: string
	version?: string
}

export interface SamplingConfig {
	tailSampleFn: TailSampleFn
}

export interface TraceConfig {
	exporter: ExporterConfig
	globals?: GlobalsConfig
	sampling?: SamplingConfig
	postProcessorFn?: PostProcessorFn
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	globals: Required<GlobalsConfig>
	postProcessorFn: PostProcessorFn
}

export type Trigger = Request | MessageBatch | 'do-alarm'
