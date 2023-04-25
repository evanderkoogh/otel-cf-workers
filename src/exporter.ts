import { createExportTraceServiceRequest } from '@opentelemetry/otlp-transformer'
import { ExportServiceError, OTLPExporterConfigBase, OTLPExporterError } from '@opentelemetry/otlp-exporter-base'
import { unwrap } from './instrumentation/common'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'

const defaultHeaders: Record<string, string> = {
	accept: 'application/json',
	'content-type': 'application/json',
}

export interface FetchTraceExporterConfig extends OTLPExporterConfigBase {
	url: string
}

export class OTLPFetchTraceExporter {
	private headers: Record<string, string>
	private url: string
	constructor(config: FetchTraceExporterConfig) {
		this.url = config.url
		this.headers = Object.assign({}, defaultHeaders, config.headers)
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

	send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void {
		const exportMessage = createExportTraceServiceRequest(items, true)
		const body = JSON.stringify(exportMessage)
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
