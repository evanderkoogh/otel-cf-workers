import merge from 'deepmerge'

import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { SpanExporter } from '@opentelemetry/sdk-trace-base'

import { Initialiser, Trigger, TraceConfig, ResolvedTraceConfig, ExporterConfig } from './config'
import { OTLPExporter } from './exporter'
import { WorkerTracerProvider } from './provider'
import { isHeadSampled, isRootErrorSpan, multiTailSampler } from './sampling'
import { BatchTraceSpanProcessor } from './spanprocessor'
import { createFetchHandler, instrumentGlobalFetch } from './instrumentation/fetch'
import { instrumentGlobalCache } from './instrumentation/cache'
import { createQueueHandler } from './instrumentation/queue'
import { DOClass, instrumentDOClass } from './instrumentation/do'
import { unwrap } from './instrumentation/wrap'

instrumentGlobalCache()
instrumentGlobalFetch()

type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
type QueueHandler = ExportedHandlerQueueHandler

export type ResolveConfigFn = (env: any, trigger: Trigger) => TraceConfig
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
		[SemanticResourceAttributes.CLOUD_PROVIDER]: 'cloudflare',
		[SemanticResourceAttributes.CLOUD_PLATFORM]: 'cloudflare.workers',
		[SemanticResourceAttributes.CLOUD_REGION]: 'earth',
		// [SemanticResourceAttributes.FAAS_NAME]: '//TODO',
		// [SemanticResourceAttributes.FAAS_VERSION]: '//TODO',
		[SemanticResourceAttributes.FAAS_MAX_MEMORY]: 128,
		[SemanticResourceAttributes.TELEMETRY_SDK_LANGUAGE]: 'JavaScript',
		[SemanticResourceAttributes.TELEMETRY_SDK_NAME]: '@microlabs/otel-workers-sdk',
	}
	const serviceResource = new Resource({
		[SemanticResourceAttributes.SERVICE_NAME]: config.service.name,
		[SemanticResourceAttributes.SERVICE_NAMESPACE]: config.service.namespace,
		[SemanticResourceAttributes.SERVICE_VERSION]: config.service.version,
	})
	const resource = new Resource(workerResourceAttrs)
	return resource.merge(serviceResource)
}

function isSpanExporter(exporterConfig: ExporterConfig): exporterConfig is SpanExporter {
	return !!(exporterConfig as SpanExporter).export
}

let initialised = false
function init(config: ResolvedTraceConfig): void {
	if (!initialised) {
		propagation.setGlobalPropagator(new W3CTraceContextPropagator())
		const resource = createResource(config)
		const exporter = isSpanExporter(config.exporter) ? config.exporter : new OTLPExporter(config.exporter)
		const tailSampler = multiTailSampler([isHeadSampled, isRootErrorSpan])
		const spanProcessor = new BatchTraceSpanProcessor(exporter, tailSampler)
		const provider = new WorkerTracerProvider(spanProcessor, resource)
		provider.register()
		initialised = true
	}
}

const defaults = {
	bindings: {
		kv: true,
	},
	globals: {
		caches: true,
		fetch: {
			includeTraceContext: true,
		},
	},
}
function parseConfig(supplied: TraceConfig): ResolvedTraceConfig {
	return merge(defaults, supplied)
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
	config: ConfigurationOption
): ExportedHandler<E, Q, C> {
	const initialiser = createInitialiser(config)

	if (handler.fetch) {
		const fetcher = unwrap(handler.fetch) as FetchHandler
		handler.fetch = createFetchHandler(fetcher, initialiser)
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

export { waitUntilTrace } from './instrumentation/fetch'
