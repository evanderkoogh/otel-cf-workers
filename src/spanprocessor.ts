import { Context, Span } from '@opentelemetry/api'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
import { getActiveConfig } from './config'
import { TraceFlushableSpanProcessor } from './types'
import { TailSampleFn } from './sampling'

function getSampler(): TailSampleFn {
	const conf = getActiveConfig()
	if (!conf) {
		console.log('Could not find config for sampling, sending everything by default')
	}
	return conf ? conf.sampling.tailSampler : () => true
}

class TraceState {
	private unexportedSpans: ReadableSpan[] = []
	private inprogressSpans = new Set<string>()
	private exporter: SpanExporter
	private exportPromises: Promise<void>[] = []
	private localRootSpan?: ReadableSpan
	private traceDecision?: boolean

	constructor(exporter: SpanExporter) {
		this.exporter = exporter
	}

	addSpan(span: Span): void {
		const readableSpan = span as unknown as ReadableSpan
		this.localRootSpan = this.localRootSpan || readableSpan
		this.unexportedSpans.push(readableSpan)
		this.inprogressSpans.add(span.spanContext().spanId)
	}

	endSpan(span: ReadableSpan): void {
		this.inprogressSpans.delete(span.spanContext().spanId)
		if (this.inprogressSpans.size === 0) {
			this.flush()
		}
	}

	sample() {
		if (this.traceDecision === undefined && this.unexportedSpans.length > 0) {
			const sampler = getSampler()
			this.traceDecision = sampler({
				traceId: this.localRootSpan!.spanContext().traceId,
				localRootSpan: this.localRootSpan!,
				spans: this.unexportedSpans,
			})
		}
		this.unexportedSpans = this.traceDecision ? this.unexportedSpans : []
	}

	async flush(): Promise<void> {
		if (this.unexportedSpans.length > 0) {
			this.sample()
			const finishedSpans = this.unexportedSpans.filter((span) => !this.isSpanInProgress(span))
			this.unexportedSpans = this.unexportedSpans.filter((span) => this.isSpanInProgress(span))
			if (finishedSpans.length > 0) {
				this.exportPromises.push(this.exportSpans(finishedSpans))
			}
		}
		if (this.exportPromises.length > 0) {
			await Promise.allSettled(this.exportPromises)
		}
	}

	private isSpanInProgress(span: ReadableSpan) {
		return this.inprogressSpans.has(span.spanContext().spanId)
	}

	private async exportSpans(spans: ReadableSpan[]): Promise<void> {
		await scheduler.wait(1)
		const promise = new Promise<void>((resolve, reject) => {
			this.exporter.export(spans, (result) => {
				if (result.code === ExportResultCode.SUCCESS) {
					resolve()
				} else {
					console.log('exporting spans failed! ' + result.error)
					reject(result.error)
				}
			})
		})
		await promise
	}
}

type traceId = string
export class BatchTraceSpanProcessor implements TraceFlushableSpanProcessor {
	private traces: Record<traceId, TraceState> = {}

	constructor(private exporter: SpanExporter) {}

	getTraceState(traceId: string): TraceState {
		const traceState = this.traces[traceId] || new TraceState(this.exporter)
		this.traces[traceId] = traceState
		return traceState
	}

	onStart(span: Span, _parentContext: Context): void {
		const traceId = span.spanContext().traceId
		this.getTraceState(traceId).addSpan(span)
	}

	onEnd(span: ReadableSpan): void {
		const traceId = span.spanContext().traceId
		this.getTraceState(traceId).endSpan(span)
	}

	async forceFlush(traceId?: traceId): Promise<void> {
		if (traceId) {
			await this.getTraceState(traceId).flush()
		} else {
			const promises = Object.values(this.traces).map((traceState: TraceState) => traceState.flush)
			await Promise.allSettled(promises)
		}
	}

	async shutdown(): Promise<void> {
		await this.forceFlush()
	}
}
