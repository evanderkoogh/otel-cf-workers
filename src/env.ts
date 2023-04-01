import { SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { WorkerTraceConfig } from './sdk'

const instrumentKV = (kv: KVNamespace, name: string, _config: WorkerTraceConfig): KVNamespace => {
	const tracer = trace.getTracer('KV')
	return new Proxy(kv, {
		get: (target, prop, receiver) => {
			const operation = prop as string
			const fn = Reflect.get(target, prop, receiver)
			return new Proxy(fn, {
				apply: (target, _thisArg, argArray) => {
					const options: SpanOptions = {
						kind: SpanKind.CLIENT,
					}
					const result = tracer.startActiveSpan(`kv:${name}:${operation}`, options, async (span) => {
						span.setAttributes({
							binding_type: 'KV',
							kv_namespace: name,
							operation,
							arguments: argArray,
						})
						const result = await Reflect.apply(target, kv, argArray)
						span.setAttribute('hasResult', !!result)
						span.end()
						return result
					})
					return result
				},
			})
		},
	})
}

const isKVNamespace = (item: unknown): item is KVNamespace => {
	return !!(item as KVNamespace).getWithMetadata
}

const instrumentEnv = (env: Record<string, unknown>, config: WorkerTraceConfig): Record<string, unknown> => {
	return new Proxy(env, {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item)) {
				return instrumentKV(item, prop as string, config)
			}
			return item
		},
	})
}

export { instrumentEnv }
