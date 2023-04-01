import { createExportTraceServiceRequest } from '@opentelemetry/otlp-transformer'

import { OTLPExporterBase, OTLPExporterConfigBase, OTLPExporterError } from '@opentelemetry/otlp-exporter-base'

const defaultHeaders: Record<string, string> = {
	accept: 'application/json',
	'content-type': 'application/json',
}

export interface FetchTraceExporterConfig extends OTLPExporterConfigBase {
	url: string
}

export class OTLPFetchTraceExporter extends OTLPExporterBase<any, any, any> {
	private headers: Record<string, string>
	constructor(config: FetchTraceExporterConfig) {
		super(config)
		this.headers = Object.assign({}, defaultHeaders, config.headers)
	}
	onShutdown(): void {}
	onInit(config: any): void {}
	send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void {
		const exportMessage = createExportTraceServiceRequest(items, true)
		const body = JSON.stringify(exportMessage)
		const params: RequestInit = {
			method: 'POST',
			headers: this.headers,
			body,
		}

		globalThis.orig_fetch!(this.url, params)
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

	getDefaultUrl(config: FetchTraceExporterConfig): string {
		return config.url
	}
	convert(objects: any[]) {
		throw new Error('This seems part of an interface, but not actually used anywhere.')
	}
}
