import { ReadableSpan, Sampler, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPExporterConfig } from './exporter'
import { FetcherConfig } from './instrumentation/fetch'
import { TailSampleFn } from './sampling'

export type PostProcessorFn = (spans: ReadableSpan[]) => ReadableSpan[]

export type ExporterConfig = OTLPExporterConfig | SpanExporter

export interface ServiceConfig {
	name: string
	namespace?: string
	version?: string
}

export interface ParentRatioSamplingConfig {
	acceptRemote?: boolean
	ratio: number
}

type HeadSamplerConf = Sampler | ParentRatioSamplingConfig
export interface SamplingConfig<HS extends HeadSamplerConf = HeadSamplerConf> {
	headSampler?: HS
	tailSampler?: TailSampleFn
}

export interface TraceConfig<EC extends ExporterConfig = ExporterConfig> {
	exporter: EC
	fetch?: FetcherConfig
	postProcessor?: PostProcessorFn
	sampling?: SamplingConfig
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	exporter: SpanExporter
	fetch: Required<FetcherConfig>
	postProcessor: PostProcessorFn
	sampling: Required<SamplingConfig<Sampler>>
}

export type Trigger = Request | MessageBatch | 'do-alarm'
