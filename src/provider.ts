import { context, trace, Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api'

import { Resource } from '@opentelemetry/resources'
import { IdGenerator, SpanProcessor } from '@opentelemetry/sdk-trace-base'

import { AsyncLocalStorageContextManager } from './context.js'
import { WorkerTracer } from './tracer.js'

/**
 * Register this TracerProvider for use with the OpenTelemetry API.
 * Undefined values may be replaced with defaults, and
 * null values will be skipped.
 *
 * @param config Configuration object for SDK registration
 */
export class WorkerTracerProvider implements TracerProvider {
	private spanProcessors: SpanProcessor[]
	private resource: Resource
	private tracers: Record<string, Tracer> = {}
	private idGenerator: IdGenerator

	constructor(spanProcessors: SpanProcessor[], resource: Resource, idGenerator: IdGenerator) {
		this.spanProcessors = spanProcessors
		this.resource = resource
		this.idGenerator = idGenerator
	}

	getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
		const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`
		if (!this.tracers[key]) {
			this.tracers[key] = new WorkerTracer(this.spanProcessors, this.resource, this.idGenerator)
		}
		return this.tracers[key]!
	}

	register(): void {
		trace.setGlobalTracerProvider(this)
		context.setGlobalContextManager(new AsyncLocalStorageContextManager())
	}
}
