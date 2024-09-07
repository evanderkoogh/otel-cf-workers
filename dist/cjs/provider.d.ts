import { Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api';
import { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
/**
 * Register this TracerProvider for use with the OpenTelemetry API.
 * Undefined values may be replaced with defaults, and
 * null values will be skipped.
 *
 * @param config Configuration object for SDK registration
 */
export declare class WorkerTracerProvider implements TracerProvider {
    private spanProcessors;
    private resource;
    private tracers;
    constructor(spanProcessors: SpanProcessor[], resource: Resource);
    getTracer(name: string, version?: string, options?: TracerOptions): Tracer;
    register(): void;
}
//# sourceMappingURL=provider.d.ts.map