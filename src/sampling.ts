import { TraceFlags, SpanStatusCode } from '@opentelemetry/api'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { TraceState } from '@opentelemetry/core'
import { Trigger } from './types'

export type TraceFlagsAndState = {
	traceFlags: TraceFlags
	traceState?: TraceState
}

export type HeadSampleFn = (trigger: Trigger) => TraceFlags | TraceFlagsAndState

export function alwaysSample(_trigger: Trigger) {
	return TraceFlags.SAMPLED
}

export function neverSample(_trigger: Trigger) {
	return TraceFlags.NONE
}

export interface ProbabilitySamplerOptions {
	probability: number
}

export function simpleProbabilitySampler(opts: ProbabilitySamplerOptions): HeadSampleFn {
	return () => {
		return Math.random() < opts.probability ? TraceFlags.SAMPLED : TraceFlags.NONE
	}
}

export interface LocalTrace {
	readonly traceId: string
	readonly localRootSpan: ReadableSpan
	readonly spans: ReadableSpan[]
}

export type TailSampleFn = (traceInfo: LocalTrace) => boolean

export function multiTailSampler(samplers: TailSampleFn[]): TailSampleFn {
	return (traceInfo) => {
		return samplers.reduce((result, sampler) => result || sampler(traceInfo), false)
	}
}

export const isHeadSampled: TailSampleFn = (traceInfo) => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return localRootSpan.spanContext().traceFlags === TraceFlags.SAMPLED
}

export const isRootErrorSpan: TailSampleFn = (traceInfo) => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return localRootSpan.status.code === SpanStatusCode.ERROR
}
