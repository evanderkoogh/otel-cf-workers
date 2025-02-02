import { createExportTraceServiceRequest, IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer'
import { ExportServiceError, OTLPExporterError } from '@opentelemetry/otlp-exporter-base'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { unwrap } from './wrap.js'
import { gzip } from 'node:zlib'

export interface OTLPExporterConfig {
	url: string
	headers?: Record<string, string>
	compression?: 'gzip'
}

const defaultHeaders: Record<string, string> = {
	accept: 'application/json',
	'content-type': 'application/json',
}

export class OTLPExporter implements SpanExporter {
	private headers: Record<string, string>
	private url: string
	private compression?: string
	constructor(config: OTLPExporterConfig) {
		this.url = config.url
		this.headers = Object.assign({}, defaultHeaders, config.headers)
		this.compression = config.compression
	}

	export(items: any[], resultCallback: (result: ExportResult) => void): void {
		this._export(items)
			.then(() => {
				resultCallback({ code: ExportResultCode.SUCCESS })
			})
			.catch((error: ExportServiceError) => {
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

	private async gzipCompress(input: string, options = {}): Promise<Buffer> {
		const output = (await new Promise((resolve, reject) => {
			gzip(input, options, function (error, result) {
				if (error) {
					reject(error)
				} else {
					resolve(result)
				}
			})
		})) as Buffer

		return output
	}

	private async getBody(exportMessage: IExportTraceServiceRequest): Promise<string | Buffer> {
		const jsonMessage = JSON.stringify(exportMessage)

		if (this.compression === 'gzip') {
			return await this.gzipCompress(jsonMessage)
		}

		return jsonMessage
	}

	private getHeaders(): HeadersInit {
		const headers = { ...this.headers }

		if (this.compression === 'gzip') {
			headers['content-encoding'] = 'gzip'
		}

		return headers
	}

	private async prepareRequest(items: any[]): Promise<RequestInit> {
		const exportMessage = createExportTraceServiceRequest(items, {
			useHex: true,
			useLongBits: false,
		})

		const body = await this.getBody(exportMessage)
		const headers = this.getHeaders()

		const params: RequestInit = {
			method: 'POST',
			headers,
			body,
		}

		return params
	}

	send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void {
		this.prepareRequest(items)
			.then((params) => unwrap(fetch)(this.url, params))
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
