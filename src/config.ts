import { z } from 'zod'
import merge from 'deepmerge'
import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPFetchTraceExporter } from './exporter'
import { WorkerTracerProvider } from './provider'
import { FlushOnlySpanProcessor } from './spanprocessor'

const exporter = z.object({
	url: z.string().url(),
	headers: z.record(z.string()),
})

const service = z.object({
	name: z.string(),
	namespace: z.string().optional(),
	version: z.string(),
})

const sanitiseKeyOpts = z.object({ namespace: z.string(), key: z.string() })
const sanitiseKeys = z.function(z.tuple([sanitiseKeyOpts]), z.string()).optional()

const kv = z.literal(false).or(z.object({ sanitiseKeys })).default({})

const bindings = z.object({ kv }).default({})

const globalFetch = z.object({ includeTraceContext: z.boolean().default(true) })

const globals = z
	.object({
		caches: z.boolean().default(true),
		fetch: z.literal(false).or(globalFetch).default({}),
	})
	.default({})

const configSchema = z.object({
	bindings,
	exporter,
	service,
	globals,
})

const deepPartialSchema = configSchema.deepPartial()

export type WorkerTraceConfig = z.output<typeof configSchema>
export type PartialTraceConfig = z.input<typeof deepPartialSchema>
export type GlobalsConfig = z.output<typeof globals>

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

let spanProcessor: SpanProcessor
const init = (config: WorkerTraceConfig): SpanProcessor => {
	if (!spanProcessor) {
		propagation.setGlobalPropagator(new W3CTraceContextPropagator())
		const resource = createResource(config)
		const exporter = new OTLPFetchTraceExporter(config.exporter)
		spanProcessor = new FlushOnlySpanProcessor(exporter)
		const provider = new WorkerTracerProvider(spanProcessor, resource)
		provider.register()
	}
	return spanProcessor
}

function ObjectifyEnv(env: Record<string, unknown>) {
	const filtered = Object.keys(env).filter((key) => key.toLowerCase().startsWith('otel.'))
	const paths = filtered.map((key) => ({ key, path: key.substring(5).split('.') }))
	const obj: any = {}
	paths.forEach((entry) => {
		let node = obj
		entry.path.forEach((path, index, array) => {
			if (index === array.length - 1) {
				node[path] = env[entry.key]
			} else {
				if (!node[path]) {
					node[path] = {}
				}
				node = node[path]
			}
		})
	})
	return obj
}

export function loadGlobalsConfig(supplied: PartialTraceConfig): GlobalsConfig {
	return globals.parse(supplied.globals)
}

export function loadConfig(supplied: PartialTraceConfig, env: Record<string, unknown>): WorkerTraceConfig {
	const parsedSupplied = deepPartialSchema.parse(supplied)
	const parsedEnv = deepPartialSchema.parse(ObjectifyEnv(env))
	const merged = merge(parsedSupplied, parsedEnv)
	const config = configSchema.parse(merged)

	const check = deepPartialSchema.strict().safeParse(supplied)
	if (!check.success) {
		console.error(`Unknown keys detected in the trace config: ${check.error.errors}`)
	}

	return config
}

export { init }
