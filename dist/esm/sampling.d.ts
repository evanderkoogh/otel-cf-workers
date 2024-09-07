import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
export interface LocalTrace {
    readonly traceId: string;
    readonly localRootSpan: ReadableSpan;
    readonly spans: ReadableSpan[];
}
export type TailSampleFn = (traceInfo: LocalTrace) => boolean;
export declare function multiTailSampler(samplers: TailSampleFn[]): TailSampleFn;
export declare const isHeadSampled: TailSampleFn;
export declare const isRootErrorSpan: TailSampleFn;
//# sourceMappingURL=sampling.d.ts.map