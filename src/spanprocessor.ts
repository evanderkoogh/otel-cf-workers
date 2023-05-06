import { Span, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'

class TraceInfo {
	readonly traceId: string
	readonly localRootSpan: Span
	readonly completedSpans: ReadableSpan[] = []
	readonly inProgressSpanIds: Set<string> = new Set()

	constructor(traceId: string, localRootSpan: Span) {
		this.traceId = traceId
		this.localRootSpan = localRootSpan
	}
}

type ExportFinishedListener = (result: ExportResult) => void

export class BatchTraceSpanProcessor implements SpanProcessor {
	private traceInfos: Map<string, TraceInfo> = new Map()
	private listeners: Map<string, ExportFinishedListener> = new Map()
	private exporter: SpanExporter

	constructor(exporter: SpanExporter) {
		this.exporter = exporter
	}

	setListener(traceId: string, listener: ExportFinishedListener) {
		this.listeners.set(traceId, listener)
	}

	createNewTraceInfo(traceId: string, localRootSpan: Span) {
		const traceInfo = new TraceInfo(traceId, localRootSpan)
		this.traceInfos.set(traceId, traceInfo)
		return traceInfo
	}

	onStart(span: Span) {
		const { traceId, spanId } = span.spanContext()
		const traceInfo = this.traceInfos.get(traceId) || this.createNewTraceInfo(traceId, span)
		traceInfo.inProgressSpanIds.add(spanId)
	}

	onEnd(span: ReadableSpan) {
		const { traceId, spanId } = span.spanContext()
		const traceInfo = this.traceInfos.get(traceId)
		if (traceInfo) {
			traceInfo.inProgressSpanIds.delete(spanId)
			traceInfo.completedSpans.push(span)
			if (traceInfo.inProgressSpanIds.size === 0) {
				this.finishTrace(traceInfo)
			}
		} else {
			this.exporter.export([span], () => {})
		}
	}

	private finishTrace(traceInfo: TraceInfo) {
		const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
		const isTraceSampled = localRootSpan.spanContext().traceFlags === TraceFlags.SAMPLED
		const isSpanError = localRootSpan.status.code === SpanStatusCode.ERROR
		const shouldSample = isTraceSampled || isSpanError
		if (shouldSample) {
			this.exportSpan(traceInfo)
		}
		this.traceInfos.delete(traceInfo.traceId)
	}

	private exportSpan(traceInfo: TraceInfo) {
		this.exporter.export(traceInfo.completedSpans, (result) => {
			const traceId = traceInfo.traceId
			const listener = this.listeners.get(traceId)
			if (listener) {
				listener(result)
				this.listeners.delete(traceId)
			}
		})
	}

	async forceFlush(): Promise<void> {}
	async shutdown(): Promise<void> {}
}
