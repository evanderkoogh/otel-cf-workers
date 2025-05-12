import { Context, Span, TraceFlags } from '@opentelemetry/api'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
//import { getActiveConfig } from './config'
import { TraceFlushableSpanProcessor } from './types'

function isSpanSampled(span: ReadableSpan) {
	return (span.spanContext().traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
}

class TraceState {
	private unexportedSpans: ReadableSpan[] = []
	private inprogressSpans = new Set<string>()
	private exporter: SpanExporter
	private exportPromises: Promise<void>[] = []
	// private traceDecision?: boolean

	constructor(exporter: SpanExporter) {
		this.exporter = exporter
	}

	addSpan(span: Span): void {
		this.unexportedSpans.push(span as unknown as ReadableSpan)
		this.inprogressSpans.add(span.spanContext().spanId)
	}

	endSpan(span: ReadableSpan): void {
		this.inprogressSpans.delete(span.spanContext().spanId)
		if (this.inprogressSpans.size === 0) {
			this.flush()
		}
	}

	async flush(): Promise<void> {
		this.unexportedSpans = this.unexportedSpans.filter(isSpanSampled)
		if (this.unexportedSpans.length > 0) {
			const finishedSpans = this.unexportedSpans.filter((span) => !this.inprogressSpans.has(span.spanContext().spanId))
			this.unexportedSpans = this.unexportedSpans.filter((span) => this.inprogressSpans.has(span.spanContext().spanId))
			if (finishedSpans.length > 0) {
				this.exportPromises.push(this.exportSpans(finishedSpans))
			}
		}
		if (this.exportPromises.length > 0) {
			await Promise.allSettled(this.exportPromises)
		}
	}

	private async exportSpans(spans: ReadableSpan[]): Promise<void> {
		await scheduler.wait(1)
		const promise = new Promise<void>((resolve, reject) => {
			this.exporter.export(spans, (result) => {
				if (result.code === ExportResultCode.SUCCESS) {
					console.log('Done exporting.')
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
