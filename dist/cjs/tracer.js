"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerTracer = void 0;
exports.withNextSpan = withNextSpan;
const api_1 = require("@opentelemetry/api");
const core_1 = require("@opentelemetry/core");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const span_js_1 = require("./span.js");
const config_js_1 = require("./config.js");
let withNextSpanAttributes;
class WorkerTracer {
    constructor(spanProcessors, resource) {
        this.idGenerator = new sdk_trace_base_1.RandomIdGenerator();
        this._spanProcessors = spanProcessors;
        this.resource = resource;
    }
    get spanProcessors() {
        return this._spanProcessors;
    }
    addToResource(extra) {
        this.resource.merge(extra);
    }
    startSpan(name, options = {}, context = api_1.context.active()) {
        if (options.root) {
            context = api_1.trace.deleteSpan(context);
        }
        const parentSpan = api_1.trace.getSpan(context);
        const parentSpanContext = parentSpan === null || parentSpan === void 0 ? void 0 : parentSpan.spanContext();
        const hasParentContext = parentSpanContext && api_1.trace.isSpanContextValid(parentSpanContext);
        const traceId = hasParentContext ? parentSpanContext.traceId : this.idGenerator.generateTraceId();
        const spanKind = options.kind || api_1.SpanKind.INTERNAL;
        const sanitisedAttrs = (0, core_1.sanitizeAttributes)(options.attributes);
        const config = (0, config_js_1.getActiveConfig)();
        if (!config)
            throw new Error('Config is undefined. This is a bug in the instrumentation logic');
        const sampler = config.sampling.headSampler;
        const samplingDecision = sampler.shouldSample(context, traceId, name, spanKind, sanitisedAttrs, []);
        const { decision, traceState, attributes: attrs } = samplingDecision;
        const attributes = Object.assign({}, sanitisedAttrs, attrs, withNextSpanAttributes);
        withNextSpanAttributes = {};
        const spanId = this.idGenerator.generateSpanId();
        const parentSpanId = hasParentContext ? parentSpanContext.spanId : undefined;
        const traceFlags = decision === sdk_trace_base_1.SamplingDecision.RECORD_AND_SAMPLED ? api_1.TraceFlags.SAMPLED : api_1.TraceFlags.NONE;
        const spanContext = { traceId, spanId, traceFlags, traceState };
        const span = new span_js_1.SpanImpl({
            attributes,
            name,
            onEnd: (span) => {
                this.spanProcessors.forEach((sp) => {
                    sp.onEnd(span);
                });
            },
            resource: this.resource,
            spanContext,
            parentSpanId,
            spanKind,
            startTime: options.startTime,
        });
        this.spanProcessors.forEach((sp) => {
            //Do not get me started on the idosyncracies of the Otel JS libraries.
            //@ts-ignore
            sp.onStart(span, context);
        });
        return span;
    }
    startActiveSpan(name, ...args) {
        const options = args.length > 1 ? args[0] : undefined;
        const parentContext = args.length > 2 ? args[1] : api_1.context.active();
        const fn = args[args.length - 1];
        const span = this.startSpan(name, options, parentContext);
        const contextWithSpanSet = api_1.trace.setSpan(parentContext, span);
        return api_1.context.with(contextWithSpanSet, fn, undefined, span);
    }
}
exports.WorkerTracer = WorkerTracer;
function withNextSpan(attrs) {
    withNextSpanAttributes = Object.assign({}, withNextSpanAttributes, attrs);
}
//# sourceMappingURL=tracer.js.map