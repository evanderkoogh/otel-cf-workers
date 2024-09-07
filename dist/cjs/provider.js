"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerTracerProvider = void 0;
const api_1 = require("@opentelemetry/api");
const context_js_1 = require("./context.js");
const tracer_js_1 = require("./tracer.js");
/**
 * Register this TracerProvider for use with the OpenTelemetry API.
 * Undefined values may be replaced with defaults, and
 * null values will be skipped.
 *
 * @param config Configuration object for SDK registration
 */
class WorkerTracerProvider {
    constructor(spanProcessors, resource) {
        this.tracers = {};
        this.spanProcessors = spanProcessors;
        this.resource = resource;
    }
    getTracer(name, version, options) {
        const key = `${name}@${version || ''}:${(options === null || options === void 0 ? void 0 : options.schemaUrl) || ''}`;
        if (!this.tracers[key]) {
            this.tracers[key] = new tracer_js_1.WorkerTracer(this.spanProcessors, this.resource);
        }
        return this.tracers[key];
    }
    register() {
        api_1.trace.setGlobalTracerProvider(this);
        api_1.context.setGlobalContextManager(new context_js_1.AsyncLocalStorageContextManager());
    }
}
exports.WorkerTracerProvider = WorkerTracerProvider;
//# sourceMappingURL=provider.js.map