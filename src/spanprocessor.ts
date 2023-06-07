import { Context, Span } from '@opentelemetry/api'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { TailSampler } from './sampling'

class TraceInfo {
	readonly traceId: string
	readonly localRootSpan: ReadableSpan
	readonly completedSpans: ReadableSpan[] = []
	readonly inProgressSpanIds: Set<string> = new Set()

	constructor(traceId: string, localRootSpan: Span) {
		this.traceId = traceId
		this.localRootSpan = localRootSpan as unknown as ReadableSpan
	}
}

type ExportFinishedListener = (result: ExportResult) => void

export class BatchTraceSpanProcessor implements SpanProcessor {
	private traceInfos: Map<string, TraceInfo> = new Map()
	private listeners: Map<string, ExportFinishedListener> = new Map()
	private exporter: SpanExporter
	private tailSampler: TailSampler

	constructor(exporter: SpanExporter, tailSampler: TailSampler) {
		this.exporter = exporter
		this.tailSampler = tailSampler
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
		const { traceId, localRootSpan, completedSpans: spans } = traceInfo
		const localTrace = { traceId, localRootSpan, spans }
		if (this.tailSampler(localTrace)) {
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

	flushTrace(traceId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.setListener(traceId, (exportResult) => {
				if (exportResult.code === ExportResultCode.SUCCESS) {
					resolve()
				} else {
					reject(exportResult.error)
				}
			})
		})
	}

	async forceFlush(): Promise<void> {}
	async shutdown(): Promise<void> {}
}

export class FlushOnlySpanProcessor implements SpanProcessor {
	readonly exporter: SpanExporter
	readonly readableSpans: ReadableSpan[] = []

	constructor(exporter: SpanExporter) {
		this.exporter = exporter
	}

	forceFlush(): Promise<void> {
		return new Promise((resolve, reject) => {
			const spliced = this.readableSpans.splice(0)
			if (spliced.length > 0) {
				this.exporter.export(spliced, (result) => {
					if (result.code === ExportResultCode.SUCCESS) {
						resolve()
					} else {
						reject(result.error)
					}
				})
			}
		})
	}

	onStart(_span: Span, _parentContext: Context): void {}

	onEnd(span: ReadableSpan): void {
		this.readableSpans.push(span)
	}
	async shutdown(): Promise<void> {}
}
