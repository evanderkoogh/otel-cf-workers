import { context } from '@opentelemetry/api'
import { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { SanitiserFn } from './spanprocessor'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Trigger = Request | MessageBatch | 'do-alarm'
export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig

export interface BindingsConfig {
	kv: boolean
}

export interface OTLPExporterConfig {
	url: string
	headers?: Record<string, string>
}
export type ExporterConfig = OTLPExporterConfig | SpanExporter

export type IncludeTraceContextFn = (request: Request) => boolean
export interface FetcherConfig {
	includeTraceContext?: boolean | IncludeTraceContextFn
}
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

export function setConfig(config: ResolvedTraceConfig, ctx = context.active()) {
	return ctx.setValue(configSymbol, config)
}

export function getActiveConfig(): ResolvedTraceConfig {
	const config = context.active().getValue(configSymbol) as ResolvedTraceConfig
	return config
}
