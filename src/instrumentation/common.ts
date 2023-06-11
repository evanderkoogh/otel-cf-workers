import { TraceFlags, trace } from '@opentelemetry/api'
import { WorkerTracer } from '../tracer'
import { wrap } from './wrap'
import { BatchTraceSpanProcessor } from '../spanprocessor'
import { HeadSampleFn, TraceFlagsAndState } from '../sampling'
import { Trigger } from '../types'

type ContextAndTracker = { ctx: ExecutionContext; tracker: PromiseTracker }
type WaitUntilFn = ExecutionContext['waitUntil']

export class PromiseTracker {
	_outstandingPromises: Promise<unknown>[] = []

	get outstandingPromiseCount() {
		return this._outstandingPromises.length
	}

	track(promise: Promise<unknown>): void {
		this._outstandingPromises.push(promise)
	}

	async wait() {
		await Promise.all(this._outstandingPromises)
	}
}

function createWaitUntil(fn: WaitUntilFn, context: ExecutionContext, tracker: PromiseTracker): WaitUntilFn {
	const handler: ProxyHandler<WaitUntilFn> = {
		apply(target, thisArg, argArray) {
			tracker.track(argArray[0])
			return Reflect.apply(target, context, argArray)
		},
	}
	return wrap(fn, handler)
}

export function proxyExecutionContext(context: ExecutionContext): ContextAndTracker {
	const tracker = new PromiseTracker()
	const ctx = new Proxy(context, {
		get(target, prop) {
			if (prop === 'waitUntil') {
				const fn = Reflect.get(target, prop)
				return createWaitUntil(fn, context, tracker)
			}
		},
	})
	return { ctx, tracker }
}

export async function exportSpans(traceId: string, tracker?: PromiseTracker) {
	const tracer = trace.getTracer('export')
	if (tracer instanceof WorkerTracer) {
		await scheduler.wait(1)
		if (tracker) {
			await tracker.wait()
		}
		const spanProcessor = tracer.spanProcessor
		if (spanProcessor instanceof BatchTraceSpanProcessor && traceId) {
			await spanProcessor.flushTrace(traceId)
		} else {
			await spanProcessor.forceFlush()
		}
	} else {
		console.error('The global tracer is not of type WorkerTracer and can not export spans')
	}
}

function isFlagAndState(flags: TraceFlags | TraceFlagsAndState): flags is TraceFlagsAndState {
	return !!(flags as TraceFlagsAndState).traceFlags
}

export function getFlagsAndState(sampler: HeadSampleFn, trigger: Trigger): TraceFlagsAndState {
	const flagOrFlagAndState = sampler(trigger)
	return isFlagAndState(flagOrFlagAndState) ? flagOrFlagAndState : { traceFlags: flagOrFlagAndState }
}
