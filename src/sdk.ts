import { propagation } from '@opentelemetry/api'
import { Resource, resourceFromAttributes } from '@opentelemetry/resources'

import { Initialiser, parseConfig } from './config.js'
import { instrumentGlobalCache } from './instrumentation/cache.js'
import { DOClass, instrumentDOClass } from './instrumentation/do.js'
import { createFetchHandler, instrumentGlobalFetch } from './instrumentation/fetch.js'
import { createQueueHandler } from './instrumentation/queue.js'
import { createScheduledHandler } from './instrumentation/scheduled.js'
import { WorkerTracerProvider } from './provider.js'
import { ResolvedTraceConfig, TraceConfig, Trigger } from './types.js'
import { unwrap } from './wrap.js'
//@ts-ignore
import * as versions from '../versions.json'
import { createEmailHandler } from './instrumentation/email.js'

type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
type ScheduledHandler = ExportedHandlerScheduledHandler<unknown>
type QueueHandler = ExportedHandlerQueueHandler
type EmailHandler = EmailExportedHandler

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
		'cloud.provider': 'cloudflare',
		'cloud.platform': 'cloudflare.workers',
		'cloud.region': 'earth',
		'faas.max_memory': 134217728,
		'telemetry.sdk.language': 'js',
		'telemetry.sdk.name': '@microlabs/otel-cf-workers',
		'telemetry.sdk.version': versions['@microlabs/otel-cf-workers'],
		'telemetry.sdk.build.node_version': versions['node'],
	}
	const serviceResource = resourceFromAttributes({
		'service.name': config.service.name,
		'service.namespace': config.service.namespace,
		'service.version': config.service.version,
	})
	const resource = resourceFromAttributes(workerResourceAttrs)
	return resource.merge(serviceResource)
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

	if (handler.email) {
		const emailer = unwrap(handler.email) as EmailHandler
		handler.email = createEmailHandler(emailer, initialiser)
	}

	return handler
}

export function instrumentDO(doClass: DOClass, config: ConfigurationOption) {
	const initialiser = createInitialiser(config)

	return instrumentDOClass(doClass, initialiser)
}

export { waitUntilTrace } from './instrumentation/fetch.js'

export const __unwrappedFetch = unwrap(fetch)
