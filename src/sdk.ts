import { PartialTraceConfig, Initialiser, loadConfig, withConfig, WorkerTraceConfig } from './config'
import { executeFetchHandler } from './instrumentation/fetch'
import { instrumentGlobalCache, instrumentGlobalFetch } from './instrumentation/globals'
import { instrumentQueueHandler } from './instrumentation/queue'
import { DOClass, instrumentDO as instrDO } from './instrumentation/do'
import { propagation, trace } from '@opentelemetry/api'
import { instrumentEnv } from './instrumentation/env'
import { wrap } from './instrumentation/common'
import { WorkerTracer } from './tracer'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPFetchTraceExporter } from './exporter'
import { WorkerTracerProvider } from './provider'
import { FlushOnlySpanProcessor } from './spanprocessor'

instrumentGlobalCache()
instrumentGlobalFetch()

type ContextAndTracker = { ctx: ExecutionContext; tracker: PromiseTracker }

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

let spanProcessor: SpanProcessor
export function init(config: WorkerTraceConfig): SpanProcessor {
	if (!spanProcessor) {
		propagation.setGlobalPropagator(new W3CTraceContextPropagator())
		const resource = createResource(config)
		const exporter = new OTLPFetchTraceExporter(config.exporter)
		spanProcessor = new FlushOnlySpanProcessor(exporter)
		const provider = new WorkerTracerProvider(spanProcessor, resource)
		provider.register()
	}
	return spanProcessor
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

const exportSpans = async (tracker: PromiseTracker) => {
	const tracer = trace.getTracer('export')
	if (tracer instanceof WorkerTracer) {
		await scheduler.wait(1)
		await tracker.wait()
		await tracer.spanProcessor.forceFlush()
	} else {
		console.error('The global tracer is not of type WorkerTracer and can not export spans')
	}
}

const instrument = <E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: PartialTraceConfig
): ExportedHandler<E, Q, C> => {
	const initialiser: Initialiser = (env, _trigger) => {
		const conf = loadConfig(config, env)
		init(conf)
		return conf
	}

	if (handler.fetch) {
		const fetchHandler: ProxyHandler<ExportedHandlerFetchHandler> = {
			apply: async (target, _thisArg, argArray: Parameters<ExportedHandlerFetchHandler>): Promise<Response> => {
				const [request, orig_env, orig_ctx] = argArray
				const config = initialiser(orig_env as Record<string, unknown>, request)
				const env = instrumentEnv(orig_env as Record<string, unknown>, config.bindings)
				const { ctx, tracker } = proxyExecutionContext(orig_ctx)

				try {
					const args = { request, env, ctx }
					const response = await withConfig(config, executeFetchHandler, undefined, target, args, config)
					return response
				} catch (error) {
					throw error
				} finally {
					orig_ctx.waitUntil(exportSpans(tracker))
				}
			},
		}
		handler.fetch = wrap(handler.fetch, fetchHandler)
	}
	if (handler.queue) {
		handler.queue = instrumentQueueHandler(handler.queue, initialiser)
	}
	return handler
}

const instrumentDO = (doClass: DOClass, config: PartialTraceConfig) => {
	return instrDO(doClass, config)
}

export { instrument, instrumentDO }
