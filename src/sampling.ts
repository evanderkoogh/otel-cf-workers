import { TraceFlags, SpanStatusCode } from '@opentelemetry/api'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { TraceState } from '@opentelemetry/core'
import { Trigger } from './types'

export type TraceFlagsAndState = {
	traceFlags: TraceFlags
	traceState: TraceState
}

export type HeadSamplerFn = (trigger: Trigger) => TraceFlags | TraceFlagsAndState

export function alwaysSample(_trigger: Trigger) {
	return TraceFlags.SAMPLED
}

export function neverSample(_trigger: Trigger) {
	return TraceFlags.NONE
}

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
