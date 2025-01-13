import { Context, Span } from '@opentelemetry/api'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
import { getActiveConfig } from './config'
import { TraceFlushableSpanProcessor } from './types'

export class BatchTraceSpanProcessor implements TraceFlushableSpanProcessor {
	private traces: Record<string, Span[]> = {}

	constructor(private exporter: SpanExporter) {}

	private export(traceId: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const config = getActiveConfig()
			if (!config) throw new Error('Config is undefined. This is a bug in the instrumentation logic')
			const spans = this.traces[traceId] as unknown[] as ReadableSpan[] | undefined
			if (spans) {
				this.exporter.export(spans, (result) => {
					if (result.code === ExportResultCode.SUCCESS) {
						resolve()
					} else {
						console.log('exporting spans failed! ' + result.error)
						reject(result.error)
					}
				})
			} else {
				resolve()
			}
		})
	}

	onStart(span: Span, _parentContext: Context): void {
		const traceId = span.spanContext().traceId
		const spans = this.traces[traceId] || []
		spans.push(span)
		this.traces[traceId] = spans
	}

	onEnd(_span: ReadableSpan): void {
		//this space intentionally left blank
	}

	forceFlush(traceId: string = ''): Promise<void> {
		return this.export(traceId)
	}

	async shutdown(): Promise<void> {}
}
