import { ReadableSpan, Sampler, SpanExporter } from '@opentelemetry/sdk-trace-base'
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

export interface ParentRatioSamplingConfig {
	acceptRemote?: boolean
	ratio: number
}

export interface SamplingConfig {
	headSampler?: Sampler | ParentRatioSamplingConfig
	tailSampler?: TailSampleFn
}

export interface TraceConfig<EC extends ExporterConfig = ExporterConfig> {
	exporter: EC
	globals?: GlobalsConfig
	sampling?: SamplingConfig
	postProcessorFn?: PostProcessorFn
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	exporter: SpanExporter
	globals: Required<GlobalsConfig>
	postProcessorFn: PostProcessorFn
	sampling: Required<SamplingConfig>
}

export type Trigger = Request | MessageBatch | 'do-alarm'
