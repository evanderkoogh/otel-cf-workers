import { Attributes, Context, SpanOptions, TextMapPropagator, Span } from '@opentelemetry/api'
import { ReadableSpan, Sampler, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPExporterConfig } from './exporter.js'
import { FetchHandlerConfig, FetcherConfig } from './instrumentation/fetch.js'
import { TailSampleFn } from './sampling.js'

export type OrPromise<T extends any> = T | Promise<T>

export type ResolveConfigFn<Env = any> = (env: Env, trigger: Trigger) => TraceConfig
export type ConfigurationOption = TraceConfig | ResolveConfigFn

export type PostProcessorFn = (spans: ReadableSpan[]) => ReadableSpan[]

export type ExporterConfig = OTLPExporterConfig | SpanExporter

export interface InitialSpanInfo {
	name: string
	options: SpanOptions
	context?: Context
}

export interface HandlerInstrumentation<T extends Trigger, R extends any> {
	getInitialSpanInfo: (trigger: T) => InitialSpanInfo
	getAttributesFromResult?: (result: Awaited<R>) => Attributes
	instrumentTrigger?: (trigger: T) => T
	executionSucces?: (span: Span, trigger: T, result: Awaited<R>) => void
	executionFailed?: (span: Span, trigger: T, error?: any) => void
}

export type TraceFlushableSpanProcessor = SpanProcessor & { forceFlush: (traceId?: string) => Promise<void> }

export interface HandlerConfig {
	fetch?: FetchHandlerConfig
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

type HeadSamplerConf = Sampler | ParentRatioSamplingConfig
export interface SamplingConfig<HS extends HeadSamplerConf = HeadSamplerConf> {
	headSampler?: HS
	tailSampler?: TailSampleFn
}

export interface InstrumentationOptions {
	instrumentGlobalFetch?: boolean
	instrumentGlobalCache?: boolean
}

interface TraceConfigBase {
	service: ServiceConfig
	handlers?: HandlerConfig
	fetch?: FetcherConfig
	postProcessor?: PostProcessorFn
	sampling?: SamplingConfig
	propagator?: TextMapPropagator
	instrumentation?: InstrumentationOptions
}

interface TraceConfigExporter extends TraceConfigBase {
	exporter: ExporterConfig
}

interface TraceConfigSpanProcessors extends TraceConfigBase {
	spanProcessors: SpanProcessor | SpanProcessor[]
}

export type TraceConfig = TraceConfigExporter | TraceConfigSpanProcessors

export function isSpanProcessorConfig(config: TraceConfig): config is TraceConfigSpanProcessors {
	return !!(config as TraceConfigSpanProcessors).spanProcessors
}

export interface ResolvedTraceConfig extends TraceConfigBase {
	handlers: Required<HandlerConfig>
	fetch: Required<FetcherConfig>
	postProcessor: PostProcessorFn
	sampling: Required<SamplingConfig<Sampler>>
	spanProcessors: SpanProcessor[]
	propagator: TextMapPropagator
	instrumentation: InstrumentationOptions
}

export interface DOConstructorTrigger {
	id: string
	name?: string
}

export type Trigger =
	| Request
	| MessageBatch
	| ScheduledController
	| DOConstructorTrigger
	| 'do-alarm'
	| ForwardableEmailMessage
