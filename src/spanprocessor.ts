import { Context } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { ReadableSpan, Span, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'

export class FlushOnlySpanProcessor implements SpanProcessor {
	readonly exporter: SpanExporter
	readonly readableSpans: ReadableSpan[] = []

	constructor(exporter: SpanExporter) {
		this.exporter = exporter
	}

	forceFlush(): Promise<void> {
		return new Promise((resolve, reject) => {
			const spliced = this.readableSpans.splice(0)
			this.exporter.export(spliced, (result) => {
				if (result.code === ExportResultCode.SUCCESS) {
					resolve()
				} else {
					reject(result.error)
				}
			})
		})
	}

	onStart(_span: Span, _parentContext: Context): void {}

	onEnd(span: ReadableSpan): void {
		this.readableSpans.push(span)
	}
	async shutdown(): Promise<void> {}
}
