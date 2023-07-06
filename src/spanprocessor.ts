import { Context, Span } from '@opentelemetry/api'
import { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { Action, State, stateMachine } from 'ts-checked-fsm'

import { getActiveConfig } from './config.js'
import { TailSampleFn } from './sampling.js'
import { PostProcessorFn } from './types.js'

type CompletedTrace = {
	traceId: string
	localRootSpan: ReadableSpan
	completedSpans: ReadableSpan[]
}

type InProgressTrace = {
	inProgressSpanIds: Set<string>
} & CompletedTrace

type InitialState = State<'not_started'>
type InProgressTraceState = State<'in_progress', InProgressTrace>
type TraceCompleteState = State<'trace_complete', CompletedTrace>
type ExportingState = State<'exporting', { promise: Promise<ExportResult> }>
type DoneState = State<'done'>

type StartExportArguments = {
	exporter: SpanExporter
	tailSampler: TailSampleFn
	postProcessor: PostProcessorFn
}

type StartSpanAction = Action<'startSpan', { span: Span }>
type EndSpanAction = Action<'endSpan', { span: ReadableSpan }>
type StartExportAction = Action<'startExport', { args: StartExportArguments }>

function newTrace(currentState: InitialState, { span }: StartSpanAction): InProgressTraceState {
	const spanId = span.spanContext().spanId
	return {
		...currentState,
		stateName: 'in_progress',
		traceId: span.spanContext().traceId,
		localRootSpan: span as unknown as ReadableSpan,
		completedSpans: [] as ReadableSpan[],
		inProgressSpanIds: new Set([spanId]),
	} as const
}

function newSpan(currentState: InProgressTraceState, { span }: StartSpanAction): InProgressTraceState {
	const spanId = span.spanContext().spanId
	currentState.inProgressSpanIds.add(spanId)
	return { ...currentState }
}

function endSpan(
	currentState: InProgressTraceState,
	{ span }: EndSpanAction
): InProgressTraceState | TraceCompleteState {
	currentState.completedSpans.push(span)
	currentState.inProgressSpanIds.delete(span.spanContext().spanId)
	if (currentState.inProgressSpanIds.size === 0) {
		return {
			stateName: 'trace_complete',
			traceId: currentState.traceId,
			localRootSpan: currentState.localRootSpan,
			completedSpans: currentState.completedSpans,
		} as const
	} else {
		return { ...currentState }
	}
}

function startExport(currentState: TraceCompleteState, { args }: StartExportAction): ExportingState | DoneState {
	const { exporter, tailSampler, postProcessor } = args
	const { traceId, localRootSpan, completedSpans: spans } = currentState
	const shouldExport = tailSampler({ traceId, localRootSpan, spans })
	if (shouldExport) {
		const exportSpans = postProcessor(spans)
		const promise = new Promise<ExportResult>((resolve) => {
			exporter.export(exportSpans, resolve)
		})
		return { stateName: 'exporting', promise }
	} else {
		return { stateName: 'done' }
	}
}

const { nextState } = stateMachine()
	.state('not_started')
	.state<'in_progress', InProgressTraceState>('in_progress')
	.state<'trace_complete', TraceCompleteState>('trace_complete')
	.state<'exporting', ExportingState>('exporting')
	.state('done')
	.transition('not_started', 'in_progress')
	.transition('in_progress', 'in_progress')
	.transition('in_progress', 'trace_complete')
	.transition('trace_complete', 'exporting')
	.transition('trace_complete', 'done')
	.transition('exporting', 'done')
	.action<'startSpan', StartSpanAction>('startSpan')
	.action<'endSpan', EndSpanAction>('endSpan')
	.action<'startExport', StartExportAction>('startExport')
	.action('exportDone')
	.actionHandler('not_started', 'startSpan', newTrace)
	.actionHandler('in_progress', 'startSpan', newSpan)
	.actionHandler('in_progress', 'endSpan', endSpan)
	.actionHandler('trace_complete', 'startExport', startExport)
	.actionHandler('exporting', 'exportDone', (_c, _a) => {
		return { stateName: 'done' } as const
	})
	.done()

type AnyTraceState = Parameters<typeof nextState>[0]
type AnyTraceAction = Parameters<typeof nextState>[1]

export class BatchTraceSpanProcessor implements SpanProcessor {
	private traces: Map<string, AnyTraceState> = new Map()
	private inprogressExports: Map<string, Promise<ExportResult>> = new Map()

	private action(traceId: string, action: AnyTraceAction): AnyTraceState {
		const state = this.traces.get(traceId) || { stateName: 'not_started' }
		const newState = nextState(state, action)
		if (newState.stateName === 'done') {
			this.traces.delete(traceId)
		} else {
			this.traces.set(traceId, newState)
		}
		return newState
	}

	private export(traceId: string) {
		const { exporter, sampling, postProcessor } = getActiveConfig()
		const exportArgs = { exporter, tailSampler: sampling.tailSampler, postProcessor }
		const newState = this.action(traceId, { actionName: 'startExport', args: exportArgs })
		if (newState.stateName === 'exporting') {
			const promise = newState.promise
			this.inprogressExports.set(traceId, promise)
			promise.then((result) => {
				if (result.code === ExportResultCode.FAILED) {
					console.log('Error sending spans to exporter:', result.error)
				}
				this.action(traceId, { actionName: 'exportDone' })
				this.inprogressExports.delete(traceId)
			})
		}
	}

	onStart(span: Span, _parentContext: Context): void {
		const traceId = span.spanContext().traceId
		this.action(traceId, { actionName: 'startSpan', span })
	}

	onEnd(span: ReadableSpan): void {
		const traceId = span.spanContext().traceId
		const state = this.action(traceId, { actionName: 'endSpan', span })
		if (state.stateName === 'trace_complete') {
			this.export(traceId)
		}
	}

	async forceFlush(): Promise<void> {
		await Promise.allSettled(this.inprogressExports.values())
	}

	async shutdown(): Promise<void> {}
}
