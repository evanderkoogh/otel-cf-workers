import { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { SanitiserFn } from './spanprocessor'
import { OTLPExporterConfig } from './exporter'
import { FetcherConfig } from './instrumentation/fetch'
import { HeadSampleFn, TailSampleFn } from './sampling'

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
	headSampleFn: HeadSampleFn
	tailSampleFn: TailSampleFn
}

export interface TraceConfig {
	bindings?: BindingsConfig
	exporter: ExporterConfig
	globals?: GlobalsConfig
	sampling?: SamplingConfig
	sanitiser?: SanitiserFn
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	bindings: BindingsConfig
	globals: Required<GlobalsConfig>
}

export type Trigger = Request | MessageBatch | 'do-alarm'
