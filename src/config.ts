import { z } from 'zod'
import merge from 'deepmerge'
import { context } from '@opentelemetry/api'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Trigger = Request | MessageBatch
export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => WorkerTraceConfig

function createBindings() {
	const sanitiseKeyOpts = z.object({ namespace: z.string(), key: z.string() })
	const sanitiseKeys = z.function(z.tuple([sanitiseKeyOpts]), z.string()).optional()
	const kv = z.literal(false).or(z.object({ sanitiseKeys })).default({})

	return z.object({ kv }).default({})
}

function createExporter() {
	return z.object({
		url: z.string().url(),
		headers: z.record(z.string()).default({}),
	})
}

function createGlobals() {
	const globalFetch = z.object({ includeTraceContext: z.boolean().default(true) })

	return z
		.object({
			caches: z.boolean().default(true),
			fetch: z.literal(false).or(globalFetch).default({}),
		})
		.default({})
}

function createService() {
	return z.object({
		name: z.string(),
		namespace: z.string().optional(),
		version: z.string().optional(),
	})
}

const configSchema = z.object({
	bindings: createBindings(),
	exporter: createExporter(),
	globals: createGlobals(),
	service: createService(),
})

const deepPartialSchema = configSchema.deepPartial()

export type WorkerTraceConfig = z.output<typeof configSchema>
export type PartialTraceConfig = z.input<typeof deepPartialSchema>

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

export function loadConfig(supplied: PartialTraceConfig, env: Record<string, unknown>): WorkerTraceConfig {
	const parsedSupplied = deepPartialSchema.parse(supplied)
	const parsedEnv = deepPartialSchema.parse(ObjectifyEnv(env))
	const merged = merge(parsedSupplied, parsedEnv)
	const result = configSchema.safeParse(merged)
	if (!result.success) {
		console.error(result.error)
		throw result.error
	}
	const config = result.data

	const check = deepPartialSchema.strict().safeParse(supplied)
	if (!check.success) {
		console.error(`Unknown keys detected in the trace config: ${check.error.errors}`)
	}

	return config
}

export function withConfig<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
	config: WorkerTraceConfig,
	fn: F,
	thisArg?: ThisParameterType<F>,
	...args: A
): ReturnType<F> {
	const new_context = context.active().setValue(configSymbol, config)
	return context.with(new_context, fn, thisArg, ...args)
}

export function getActiveConfig(): WorkerTraceConfig | undefined {
	const config = context.active().getValue(configSymbol)
	return !!config ? (config as WorkerTraceConfig) : undefined
}
