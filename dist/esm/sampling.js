import { TraceFlags, SpanStatusCode } from '@opentelemetry/api';
export function multiTailSampler(samplers) {
    return (traceInfo) => {
        return samplers.reduce((result, sampler) => result || sampler(traceInfo), false);
    };
}
export const isHeadSampled = (traceInfo) => {
    const localRootSpan = traceInfo.localRootSpan;
    return (localRootSpan.spanContext().traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED;
};
export const isRootErrorSpan = (traceInfo) => {
    const localRootSpan = traceInfo.localRootSpan;
    return localRootSpan.status.code === SpanStatusCode.ERROR;
};
//# sourceMappingURL=sampling.js.map