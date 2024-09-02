import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import {
	AlwaysOnSampler,
	ParentBasedSampler,
	ReadableSpan,
	Sampler,
	SpanExporter,
	TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base'
import {
	ATTR_TELEMETRY_SDK_LANGUAGE,
	ATTR_TELEMETRY_SDK_NAME,
	ATTR_TELEMETRY_SDK_VERSION,
} from '@opentelemetry/semantic-conventions'

import {
	ATTR_CLOUD_PROVIDER,
	ATTR_CLOUD_PLATFORM,
	ATTR_CLOUD_REGION,
	ATTR_FAAS_MAX_MEMORY,
} from '@opentelemetry/semantic-conventions/incubating'

import { Initialiser } from './config.js'
import { OTLPExporter } from './exporter.js'
import { WorkerTracerProvider } from './provider.js'
import { isHeadSampled, isRootErrorSpan, multiTailSampler } from './sampling.js'
import { BatchTraceSpanProcessor } from './spanprocessor.js'
import {
	Trigger,
	TraceConfig,
	ResolvedTraceConfig,
	ExporterConfig,
	ParentRatioSamplingConfig,
	isSpanProcessorConfig,
} from './types.js'
import { unwrap } from './wrap.js'
import { createFetchHandler, instrumentGlobalFetch } from './instrumentation/fetch.js'
import { instrumentGlobalCache } from './instrumentation/cache.js'
import { createQueueHandler } from './instrumentation/queue.js'
import { DOClass, instrumentDOClass } from './instrumentation/do.js'
import { createScheduledHandler } from './instrumentation/scheduled.js'
// import { name, version } from '../package.json'

type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
type ScheduledHandler = ExportedHandlerScheduledHandler<unknown>
type QueueHandler = ExportedHandlerQueueHandler

export type ResolveConfigFn<Env = any> = (env: Env, trigger: Trigger) => TraceConfig
export type ConfigurationOption = TraceConfig | ResolveConfigFn

export function isRequest(trigger: Trigger): trigger is Request {
	return trigger instanceof Request
}

export function isMessageBatch(trigger: Trigger): trigger is MessageBatch {
	return !!(trigger as MessageBatch).ackAll
}

export function isAlarm(trigger: Trigger): trigger is 'do-alarm' {
	return trigger === 'do-alarm'
}

const createResource = (config: ResolvedTraceConfig): Resource => {
	const workerResourceAttrs = {
		[ATTR_CLOUD_PROVIDER]: 'cloudflare',
		[ATTR_CLOUD_PLATFORM]: 'cloudflare.workers',
		[ATTR_CLOUD_REGION]: 'earth',
		[ATTR_FAAS_MAX_MEMORY]: 134217728,
		[ATTR_TELEMETRY_SDK_LANGUAGE]: 'js',
		[ATTR_TELEMETRY_SDK_NAME]: '@microlabs/otel-cf-workers',
		[ATTR_TELEMETRY_SDK_VERSION]: '1.0.0-rc.X',
	}
	const serviceResource = new Resource(config.resource)
	const resource = new Resource(workerResourceAttrs)
	return resource.merge(serviceResource)
}

function isSpanExporter(exporterConfig: ExporterConfig): exporterConfig is SpanExporter {
	return !!(exporterConfig as SpanExporter).export
}

let initialised = false
function init(config: ResolvedTraceConfig): void {
	if (!initialised) {
		if (config.instrumentation.instrumentGlobalCache) {
			instrumentGlobalCache()
		}
		if (config.instrumentation.instrumentGlobalFetch) {
			instrumentGlobalFetch()
		}
		propagation.setGlobalPropagator(config.propagator)
		const resource = createResource(config)

		const provider = new WorkerTracerProvider(config.spanProcessors, resource)
		provider.register()
		initialised = true
	}
}

function isSampler(sampler: Sampler | ParentRatioSamplingConfig): sampler is Sampler {
	return !!(sampler as Sampler).shouldSample
}

function createSampler(conf: ParentRatioSamplingConfig): Sampler {
	const ratioSampler = new TraceIdRatioBasedSampler(conf.ratio)
	if (typeof conf.acceptRemote === 'boolean' && !conf.acceptRemote) {
		return new ParentBasedSampler({
			root: ratioSampler,
			remoteParentSampled: ratioSampler,
			remoteParentNotSampled: ratioSampler,
		})
	} else {
		return new ParentBasedSampler({ root: ratioSampler })
	}
}

function parseConfig(supplied: TraceConfig): ResolvedTraceConfig {
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
			resource: supplied.resource,
			spanProcessors,
			propagator: supplied.propagator || new W3CTraceContextPropagator(),
			instrumentation: {
				instrumentGlobalCache: supplied.instrumentation?.instrumentGlobalCache ?? true,
				instrumentGlobalFetch: supplied.instrumentation?.instrumentGlobalFetch ?? true,
			},
		}
	} else {
		const exporter = isSpanExporter(supplied.exporter) ? supplied.exporter : new OTLPExporter(supplied.exporter)
		const spanProcessors = [new BatchTraceSpanProcessor(exporter)]
		const newConfig = Object.assign(supplied, { exporter: undefined, spanProcessors }) as TraceConfig
		return parseConfig(newConfig)
	}
}

function createInitialiser(config: ConfigurationOption): Initialiser {
	if (typeof config === 'function') {
		return (env, trigger) => {
			const conf = parseConfig(config(env, trigger))
			init(conf)
			return conf
		}
	} else {
		return () => {
			const conf = parseConfig(config)
			init(conf)
			return conf
		}
	}
}

export function instrument<E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: ConfigurationOption,
): ExportedHandler<E, Q, C> {
	const initialiser = createInitialiser(config)

	if (handler.fetch) {
		const fetcher = unwrap(handler.fetch) as FetchHandler
		handler.fetch = createFetchHandler(fetcher, initialiser)
	}

	if (handler.scheduled) {
		const scheduler = unwrap(handler.scheduled) as ScheduledHandler
		handler.scheduled = createScheduledHandler(scheduler, initialiser)
	}

	if (handler.queue) {
		const queuer = unwrap(handler.queue) as QueueHandler
		handler.queue = createQueueHandler(queuer, initialiser)
	}
	return handler
}

export function instrumentDO(doClass: DOClass, config: ConfigurationOption) {
	const initialiser = createInitialiser(config)

	return instrumentDOClass(doClass, initialiser)
}

export { waitUntilTrace } from './instrumentation/fetch.js'

export const __unwrappedFetch = unwrap(fetch)
