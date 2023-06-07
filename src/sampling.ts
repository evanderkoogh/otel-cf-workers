import { TraceFlags, SpanStatusCode } from '@opentelemetry/api'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'

export interface LocalTrace {
	readonly traceId: string
	readonly localRootSpan: ReadableSpan
	readonly spans: ReadableSpan[]
}

export type TailSampler = (traceInfo: LocalTrace) => boolean

export function multiTailSampler(samplers: TailSampler[]): TailSampler {
	return (traceInfo) => {
		return samplers.reduce((result, sampler) => result || sampler(traceInfo), false)
	}
}

export const isHeadSampled: TailSampler = (traceInfo) => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return localRootSpan.spanContext().traceFlags === TraceFlags.SAMPLED
}

export const isRootErrorSpan: TailSampler = (traceInfo) => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return localRootSpan.status.code === SpanStatusCode.ERROR
}
