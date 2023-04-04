import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPFetchTraceExporter } from './exporter'
import { WorkerTracerProvider } from './provider'
import { FlushOnlySpanProcessor } from './spanprocessor'

export interface WorkerTraceConfig {
	exporter: {
		url: string
		headers?: Record<string, string>
	}
	service: {
		name: string
		namespace?: string
		version: string
	}
}

const createResource = (config: WorkerTraceConfig): Resource => {
	const workerResourceAttrs = {
		[SemanticResourceAttributes.CLOUD_PROVIDER]: 'cloudflare',
		[SemanticResourceAttributes.CLOUD_PLATFORM]: 'cloudflare.workers',
		[SemanticResourceAttributes.CLOUD_REGION]: 'earth',
		// [SemanticResourceAttributes.FAAS_NAME]: '//TODO',
		// [SemanticResourceAttributes.FAAS_VERSION]: '//TODO',
		[SemanticResourceAttributes.FAAS_MAX_MEMORY]: 128,
		[SemanticResourceAttributes.TELEMETRY_SDK_LANGUAGE]: 'JavaScript',
		[SemanticResourceAttributes.TELEMETRY_SDK_NAME]: '@microlabs/otel-workers-sdk',
	}
	const serviceResource = new Resource({
		[SemanticResourceAttributes.SERVICE_NAME]: config.service.name,
		[SemanticResourceAttributes.SERVICE_NAMESPACE]: config.service.namespace,
		[SemanticResourceAttributes.SERVICE_VERSION]: config.service.version,
	})
	const resource = new Resource(workerResourceAttrs)
	return resource.merge(serviceResource)
}

const init = (config: WorkerTraceConfig): SpanProcessor => {
	propagation.setGlobalPropagator(new W3CTraceContextPropagator())
	const resource = createResource(config)
	const exporter = new OTLPFetchTraceExporter(config.exporter)
	const spanProcessor = new FlushOnlySpanProcessor(exporter)
	const provider = new WorkerTracerProvider(spanProcessor, resource)
	provider.register()
	return spanProcessor
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
