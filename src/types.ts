import { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { SanitiserFn } from './spanprocessor'
import { OTLPExporterConfig } from './exporter'
import { FetcherConfig } from './instrumentation/fetch'

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

export interface TraceConfig {
	bindings?: BindingsConfig
	exporter: ExporterConfig
	globals?: GlobalsConfig
	sanitiser?: SanitiserFn
	service: ServiceConfig
}

export interface ResolvedTraceConfig extends TraceConfig {
	bindings: BindingsConfig
	globals: Required<GlobalsConfig>
}

export type Trigger = Request | MessageBatch | 'do-alarm'
