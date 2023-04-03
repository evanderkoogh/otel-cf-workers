import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPFetchTraceExporter } from './exporter'
import { WorkerTracerProvider } from './provider'

export interface WorkerTraceConfig {
	exporter: {
		url: string
		headers?: Record<string, string>
	}
	serviceName: string
	serviceNamespace?: string
	serviceVersion?: string
}

const createResource = (config: WorkerTraceConfig): Resource => {
	const workerResourceAttrs = {
		[SemanticResourceAttributes.CLOUD_PROVIDER]: 'cloudflare',
		[SemanticResourceAttributes.CLOUD_PLATFORM]: 'cloudflare.workers',
		[SemanticResourceAttributes.CLOUD_REGION]: 'earth',
		[SemanticResourceAttributes.FAAS_NAME]: '//TODO',
		[SemanticResourceAttributes.FAAS_VERSION]: '//TODO',
		[SemanticResourceAttributes.FAAS_MAX_MEMORY]: 128,
		[SemanticResourceAttributes.TELEMETRY_SDK_LANGUAGE]: 'JavaScript',
		[SemanticResourceAttributes.TELEMETRY_SDK_NAME]: '@microlabs/otel-workers-sdk',
	}
	const serviceResource = new Resource({
		[SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
		[SemanticResourceAttributes.SERVICE_NAMESPACE]: config.serviceNamespace,
		[SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
	})
	const resource = new Resource(workerResourceAttrs)
	return resource.merge(serviceResource)
}

const init = (config: WorkerTraceConfig) => {
	propagation.setGlobalPropagator(new W3CTraceContextPropagator())
	const resource = createResource(config)
	const exporter = new OTLPFetchTraceExporter(config.exporter)
	const provider = new WorkerTracerProvider(new SimpleSpanProcessor(exporter), resource)
	provider.register()
}

const extractConfigFromEnv = (config: WorkerTraceConfig, env: Record<string, unknown>) => {
	Object.keys(env).forEach((key) => {
		key = key.toLowerCase()
		if (key.startsWith('otel.headers.')) {
			const name = key.replace('otel.headers.', '')
			const value = env[key] as string
			config.exporter = config.exporter || {}
			config.exporter.headers = config.exporter.headers || {}
			config.exporter.headers[name] = value
		}
	})
}

export { init, extractConfigFromEnv }
