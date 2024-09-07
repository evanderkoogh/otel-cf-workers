import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from './context.js';
import { WorkerTracer } from './tracer.js';
/**
 * Register this TracerProvider for use with the OpenTelemetry API.
 * Undefined values may be replaced with defaults, and
 * null values will be skipped.
 *
 * @param config Configuration object for SDK registration
 */
export class WorkerTracerProvider {
    spanProcessors;
    resource;
    tracers = {};
    constructor(spanProcessors, resource) {
        this.spanProcessors = spanProcessors;
        this.resource = resource;
    }
    getTracer(name, version, options) {
        const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`;
        if (!this.tracers[key]) {
            this.tracers[key] = new WorkerTracer(this.spanProcessors, this.resource);
        }
        return this.tracers[key];
    }
    register() {
        trace.setGlobalTracerProvider(this);
        context.setGlobalContextManager(new AsyncLocalStorageContextManager());
    }
}
//# sourceMappingURL=provider.js.map