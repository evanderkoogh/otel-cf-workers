import { Attributes, Tracer, Span, SpanOptions, Context } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SpanProcessor } from '@opentelemetry/sdk-trace-base';
export declare class WorkerTracer implements Tracer {
    private readonly _spanProcessors;
    private readonly resource;
    private readonly idGenerator;
    constructor(spanProcessors: SpanProcessor[], resource: Resource);
    get spanProcessors(): SpanProcessor[];
    addToResource(extra: Resource): void;
    startSpan(name: string, options?: SpanOptions, context?: Context): Span;
    startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, fn: F): ReturnType<F>;
    startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
    startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, options: SpanOptions, context: Context, fn: F): ReturnType<F>;
}
export declare function withNextSpan(attrs: Attributes): void;
//# sourceMappingURL=tracer.d.ts.map