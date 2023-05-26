import {
	PartialTraceConfig,
	Initialiser,
	loadConfig,
	withConfig,
	WorkerTraceConfig,
	Trigger,
	TraceConfig,
	parseConfig,
} from './config'
import { createFetchHandler, executeFetchHandler, instrumentGlobalFetch } from './instrumentation/fetch'
import { instrumentGlobalCache } from './instrumentation/cache'
import { executeQueueHandler, QueueHandlerArgs } from './instrumentation/queue'
import { DOClass, executeDOAlarm, executeDOFetch, instrumentState } from './instrumentation/do'
import { propagation, trace } from '@opentelemetry/api'
import { instrumentEnv } from './instrumentation/env'
import { unwrap, wrap } from './instrumentation/wrap'
import { WorkerTracer } from './tracer'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPFetchTraceExporter } from './exporter'
import { WorkerTracerProvider } from './provider'
import { FlushOnlySpanProcessor } from './spanprocessor'

instrumentGlobalCache()
instrumentGlobalFetch()

type ContextAndTracker = { ctx: ExecutionContext; tracker: PromiseTracker }
type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
type QueueHandler = ExportedHandlerQueueHandler

export type resolveConfig = (env: any, trigger: Trigger) => TraceConfig
export type ConfigurationOption = PartialTraceConfig | resolveConfig

export function isRequest(trigger: Trigger): trigger is Request {
	return trigger instanceof Request
}

export function isMessageBatch(trigger: Trigger): trigger is MessageBatch {
	return !!(trigger as MessageBatch).ackAll
}

export function isAlarm(trigger: Trigger): trigger is 'do-alarm' {
	return trigger === 'do-alarm'
}

const createResource = (config: WorkerTraceConfig): Resource => {
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

let initialised = false
function init(config: WorkerTraceConfig): void {
	if (!initialised) {
		propagation.setGlobalPropagator(new W3CTraceContextPropagator())
		const resource = createResource(config)
		const exporter = new OTLPFetchTraceExporter(config.exporter)
		const spanProcessor = new FlushOnlySpanProcessor(exporter)
		const provider = new WorkerTracerProvider(spanProcessor, resource)
		provider.register()
		initialised = true
	}
}

class PromiseTracker {
	_outstandingPromises: Promise<unknown>[] = []

	get outstandingPromiseCount() {
		return this._outstandingPromises.length
	}

	track(promise: Promise<unknown>): void {
		this._outstandingPromises.push(promise)
	}

	async wait() {
		await Promise.all(this._outstandingPromises)
	}
}

const proxyExecutionContext = (context: ExecutionContext): ContextAndTracker => {
	const tracker = new PromiseTracker()
	const ctx = new Proxy(context, {
		get(target, prop) {
			if (prop === 'waitUntil') {
				const fn = Reflect.get(target, prop)
				return new Proxy(fn, {
					apply(target, thisArg, argArray) {
						tracker.track(argArray[0])
						return Reflect.apply(target, context, argArray)
					},
				})
			}
		},
	})
	return { ctx, tracker }
}

const exportSpans = async (tracker?: PromiseTracker) => {
	const tracer = trace.getTracer('export')
	if (tracer instanceof WorkerTracer) {
		await scheduler.wait(1)
		if (tracker) {
			await tracker.wait()
		}
		await tracer.spanProcessor.forceFlush()
	} else {
		console.error('The global tracer is not of type WorkerTracer and can not export spans')
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
		return (env) => {
			const conf = loadConfig(config, env)
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
		const queueHandler: ProxyHandler<QueueHandler> = {
			async apply(target, _thisArg, argArray: Parameters<QueueHandler>): Promise<void> {
				const [batch, orig_env, orig_ctx] = argArray
				const config = initialiser(orig_env as Record<string, unknown>, batch)
				const env = instrumentEnv(orig_env as Record<string, unknown>)
				const { ctx, tracker } = proxyExecutionContext(orig_ctx)

				try {
					const args: QueueHandlerArgs = [batch, env, ctx]
					return await withConfig(config, executeQueueHandler, undefined, target, args)
				} catch (error) {
					throw error
				} finally {
					orig_ctx.waitUntil(exportSpans(tracker))
				}
			},
		}
		handler.queue = wrap(handler.queue, queueHandler)
	}
	return handler
}

export function instrumentDO(doClass: DOClass, config: PartialTraceConfig) {
	const initialiser = createInitialiser(config)

	const classHandler: ProxyHandler<DOClass> = {
		construct(target, [orig_state, orig_env]: ConstructorParameters<DOClass>) {
			const state = instrumentState(orig_state)
			const env = instrumentEnv(orig_env)
			const doObj = new target(state, env)
			const objHandler: ProxyHandler<DurableObject> = {
				get(target, prop) {
					if (prop === 'fetch') {
						const fetchFn = Reflect.get(target, prop)
						const fetchHandler: ProxyHandler<DurableObject['fetch']> = {
							async apply(target, _thisArg, argArray: Parameters<DurableObject['fetch']>) {
								const request = argArray[0]
								const config = initialiser(orig_env, request)
								try {
									const bound = target.bind(doObj)
									return await withConfig(config, executeDOFetch, undefined, bound, request, orig_state.id)
								} catch (error) {
									throw error
								} finally {
									exportSpans()
								}
							},
						}
						return wrap(fetchFn, fetchHandler)
					} else if (prop === 'alarm') {
						const alarmFn = Reflect.get(target, prop)
						if (alarmFn) {
							const alarmHandler: ProxyHandler<NonNullable<DurableObject['alarm']>> = {
								async apply(target) {
									const config = initialiser(orig_env, 'do-alarm')
									try {
										const bound = target.bind(doObj)
										return await withConfig(config, executeDOAlarm, undefined, bound, orig_state.id)
									} catch (error) {
										throw error
									} finally {
										exportSpans()
									}
								},
							}
							return wrap(alarmFn, alarmHandler)
						} else {
							return undefined
						}
					} else {
						const result = Reflect.get(target, prop)
						if (typeof result === 'function') {
							result.bind(doObj)
						}
						return result
					}
				},
			}
			return wrap(doObj, objHandler)
		},
	}
	return wrap(doClass, classHandler)
}
