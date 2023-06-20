import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPExporterConfig } from './exporter'
import { FetcherConfig } from './instrumentation/fetch'
import { TailSampleFn } from './sampling'

export type PostProcessorFn = (spans: ReadableSpan[]) => ReadableSpan[]

export interface BindingsConfig {
	kv: boolean
}

export type ExporterConfig = OTLPExporterConfig | SpanExporter

export interface GlobalsConfig {
	caches?: boolean
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
	bindings?: BindingsConfig
	exporter: ExporterConfig
	globals?: GlobalsConfig
	sampling?: SamplingConfig
	postProcessorFn?: PostProcessorFn
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	bindings: BindingsConfig
	globals: Required<GlobalsConfig>
	postProcessorFn: PostProcessorFn
}

export type Trigger = Request | MessageBatch | 'do-alarm'
