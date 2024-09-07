"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchTraceSpanProcessor = void 0;
const api_1 = require("@opentelemetry/api");
const core_1 = require("@opentelemetry/core");
const StateMachine_js_1 = require("./vendor/ts-checked-fsm/StateMachine.js");
const config_js_1 = require("./config.js");
function newTrace(currentState, { span }) {
    const spanId = span.spanContext().spanId;
    return Object.assign(Object.assign({}, currentState), { stateName: 'in_progress', traceId: span.spanContext().traceId, localRootSpan: span, completedSpans: [], inProgressSpanIds: new Set([spanId]) });
}
function newSpan(currentState, { span }) {
    const spanId = span.spanContext().spanId;
    currentState.inProgressSpanIds.add(spanId);
    return Object.assign({}, currentState);
}
function endSpan(currentState, { span }) {
    currentState.completedSpans.push(span);
    currentState.inProgressSpanIds.delete(span.spanContext().spanId);
    if (currentState.inProgressSpanIds.size === 0) {
        return {
            stateName: 'trace_complete',
            traceId: currentState.traceId,
            localRootSpan: currentState.localRootSpan,
            completedSpans: currentState.completedSpans,
        };
    }
    else {
        return Object.assign({}, currentState);
    }
}
function startExport(currentState, { args }) {
    const { exporter, tailSampler, postProcessor } = args;
    const { traceId, localRootSpan, completedSpans: spans } = currentState;
    const shouldExport = tailSampler({ traceId, localRootSpan, spans });
    if (shouldExport) {
        const exportSpans = postProcessor(spans);
        const promise = new Promise((resolve) => {
            exporter.export(exportSpans, resolve);
        });
        return { stateName: 'exporting', promise };
    }
    else {
        return { stateName: 'done' };
    }
}
const { nextState } = (0, StateMachine_js_1.stateMachine)()
    .state('not_started')
    .state('in_progress')
    .state('trace_complete')
    .state('exporting')
    .state('done')
    .transition('not_started', 'in_progress')
    .transition('in_progress', 'in_progress')
    .transition('in_progress', 'trace_complete')
    .transition('trace_complete', 'exporting')
    .transition('trace_complete', 'done')
    .transition('exporting', 'done')
    .action('startSpan')
    .action('endSpan')
    .action('startExport')
    .action('exportDone')
    .actionHandler('not_started', 'startSpan', newTrace)
    .actionHandler('in_progress', 'startSpan', newSpan)
    .actionHandler('in_progress', 'endSpan', endSpan)
    .actionHandler('trace_complete', 'startExport', startExport)
    .actionHandler('exporting', 'exportDone', (_c, _a) => {
    return { stateName: 'done' };
})
    .done();
class BatchTraceSpanProcessor {
    constructor(exporter) {
        this.exporter = exporter;
        this.traceLookup = new Map();
        this.localRootSpanLookup = new Map();
        this.inprogressExports = new Map();
    }
    action(localRootSpanId, action) {
        const state = this.traceLookup.get(localRootSpanId) || { stateName: 'not_started' };
        const newState = nextState(state, action);
        if (newState.stateName === 'done') {
            this.traceLookup.delete(localRootSpanId);
        }
        else {
            this.traceLookup.set(localRootSpanId, newState);
        }
        return newState;
    }
    export(localRootSpanId) {
        const config = (0, config_js_1.getActiveConfig)();
        if (!config)
            throw new Error('Config is undefined. This is a bug in the instrumentation logic');
        const { sampling, postProcessor } = config;
        const exportArgs = { exporter: this.exporter, tailSampler: sampling.tailSampler, postProcessor };
        const newState = this.action(localRootSpanId, { actionName: 'startExport', args: exportArgs });
        if (newState.stateName === 'exporting') {
            const promise = newState.promise;
            this.inprogressExports.set(localRootSpanId, promise);
            promise.then((result) => {
                if (result.code === core_1.ExportResultCode.FAILED) {
                    console.log('Error sending spans to exporter:', result.error);
                }
                this.action(localRootSpanId, { actionName: 'exportDone' });
                this.inprogressExports.delete(localRootSpanId);
            });
        }
    }
    onStart(span, parentContext) {
        var _b, _d;
        const spanId = span.spanContext().spanId;
        const parentSpanId = (_d = (_b = api_1.trace.getSpan(parentContext)) === null || _b === void 0 ? void 0 : _b.spanContext()) === null || _d === void 0 ? void 0 : _d.spanId;
        const parentRootSpanId = parentSpanId ? this.localRootSpanLookup.get(parentSpanId) : undefined;
        const localRootSpanId = parentRootSpanId || spanId;
        this.localRootSpanLookup.set(spanId, localRootSpanId);
        this.action(localRootSpanId, { actionName: 'startSpan', span });
    }
    onEnd(span) {
        const spanId = span.spanContext().spanId;
        const localRootSpanId = this.localRootSpanLookup.get(spanId);
        if (localRootSpanId) {
            const state = this.action(localRootSpanId, { actionName: 'endSpan', span });
            if (state.stateName === 'trace_complete') {
                state.completedSpans.forEach((span) => {
                    this.localRootSpanLookup.delete(span.spanContext().spanId);
                });
                this.export(localRootSpanId);
            }
        }
    }
    forceFlush() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.allSettled(this.inprogressExports.values());
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
exports.BatchTraceSpanProcessor = BatchTraceSpanProcessor;
//# sourceMappingURL=spanprocessor.js.map