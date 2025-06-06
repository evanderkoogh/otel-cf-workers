import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base'
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer'
import { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { unwrap } from './wrap.js'

//@ts-ignore
import * as versions from '../versions.json'

export interface OTLPExporterConfig {
	url: string
	headers?: Record<string, string>
}

const defaultHeaders: Record<string, string> = {
	accept: 'application/json',
	'content-type': 'application/json',
	'user-agent': `Cloudflare Worker @microlabs/otel-cf-workers v${versions['@microlabs/otel-cf-workers']}`,
}

export class OTLPExporter implements SpanExporter {
	private headers: Record<string, string>
	private url: string
	constructor(config: OTLPExporterConfig) {
		this.url = config.url
		this.headers = Object.assign({}, defaultHeaders, config.headers)
	}

	export(items: any[], resultCallback: (result: ExportResult) => void): void {
		this._export(items)
			.then(() => {
				resultCallback({ code: ExportResultCode.SUCCESS })
			})
			.catch((error) => {
				resultCallback({ code: ExportResultCode.FAILED, error })
			})
	}

	private _export(items: any[]): Promise<unknown> {
		return new Promise<void>((resolve, reject) => {
			try {
				this.send(items, resolve, reject)
			} catch (e) {
				reject(e)
			}
		})
	}

	send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void {
		const decoder = new TextDecoder()
		const exportMessage = JsonTraceSerializer.serializeRequest(items)

		const body = decoder.decode(exportMessage)
		const params: RequestInit = {
			method: 'POST',
			headers: this.headers,
			body,
		}

		unwrap(fetch)(this.url, params)
			.then((response) => {
				if (response.ok) {
					onSuccess()
				} else {
					onError(new OTLPExporterError(`Exporter received a statusCode: ${response.status}`))
				}
			})
			.catch((error) => {
				onError(new OTLPExporterError(`Exception during export: ${error.toString()}`, error.code, error.stack))
			})
	}

	async shutdown(): Promise<void> {}
}
