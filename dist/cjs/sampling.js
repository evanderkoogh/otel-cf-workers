"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRootErrorSpan = exports.isHeadSampled = void 0;
exports.multiTailSampler = multiTailSampler;
const api_1 = require("@opentelemetry/api");
function multiTailSampler(samplers) {
    return (traceInfo) => {
        return samplers.reduce((result, sampler) => result || sampler(traceInfo), false);
    };
}
const isHeadSampled = (traceInfo) => {
    const localRootSpan = traceInfo.localRootSpan;
    return (localRootSpan.spanContext().traceFlags & api_1.TraceFlags.SAMPLED) === api_1.TraceFlags.SAMPLED;
};
exports.isHeadSampled = isHeadSampled;
const isRootErrorSpan = (traceInfo) => {
    const localRootSpan = traceInfo.localRootSpan;
    return localRootSpan.status.code === api_1.SpanStatusCode.ERROR;
};
exports.isRootErrorSpan = isRootErrorSpan;
//# sourceMappingURL=sampling.js.map