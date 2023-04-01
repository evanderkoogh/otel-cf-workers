import { AsyncLocalStorageContextManager } from './context'
import * as api from '@opentelemetry/api'
import { Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api'

import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Resource } from '@opentelemetry/resources'

import { WorkerTracer } from './tracer'

/**
 * Register this TracerProvider for use with the OpenTelemetry API.
 * Undefined values may be replaced with defaults, and
 * null values will be skipped.
 *
 * @param config Configuration object for SDK registration
 */
export class WorkerTracerProvider implements TracerProvider {
	private spanProcessor: SpanProcessor
	private resource: Resource
	private tracers: Record<string, Tracer> = {}

	constructor(spanProcessor: SpanProcessor, resource: Resource) {
		this.spanProcessor = spanProcessor
		this.resource = resource
	}

	getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
		const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`
		if (!this.tracers[key]) {
			this.tracers[key] = new WorkerTracer(this.spanProcessor, this.resource)
		}
		return this.tracers[key]
	}

	register(): void {
		api.trace.setGlobalTracerProvider(this)
		api.context.setGlobalContextManager(new AsyncLocalStorageContextManager())
	}
}
