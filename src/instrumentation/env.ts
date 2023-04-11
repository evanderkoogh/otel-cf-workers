import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { WorkerTraceConfig } from '../config'
import { instrumentQueueSender } from './queue'

type BindingsConfig = WorkerTraceConfig['bindings']
type KVConfig = BindingsConfig['kv']
type isExtendedConfig<K extends KVConfig> = K extends boolean ? never : K
type KVExtendedConfig = isExtendedConfig<KVConfig>

type ExtraAttributeFn = (config: KVExtendedConfig, name: string, argArray: any[], result: any) => Attributes

const KVAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(config, name, argArray) {
		const originalKey = argArray[0]
		const arg = { namespace: name, key: originalKey }
		const key: string = config.sanitiseKeys ? config.sanitiseKeys(arg) : originalKey
		const attrs: Attributes = {
			'kv.key': key,
		}
		return attrs
	},
	get(config, name, argArray) {
		const originalKey = argArray[0]
		const arg = { namespace: name, key: originalKey }
		const key: string = config.sanitiseKeys ? config.sanitiseKeys(arg) : originalKey
		const attrs: Attributes = {
			'kv.key': key,
		}
		const opts = argArray[1]
		if (typeof opts === 'string') {
			attrs['type'] = opts
		} else if (typeof opts === 'object') {
			attrs['type'] = opts.type
			attrs['cacheTtl'] = opts.cacheTtl
		}
		return attrs
	},
	getWithMetadata(config, name, argArray, result) {
		const attrs = this.get(config, name, argArray, result)
		attrs['withMetadata'] = true
		return attrs
	},
	list(config, name, argArray, result) {
		const attrs: Attributes = {}
		const opts: KVNamespaceListOptions = argArray[0] || {}
		const { cursor, limit, prefix } = opts
		if (prefix) {
			const arg = { namespace: name, key: prefix }
			const sanitisedPrefex: string = config.sanitiseKeys ? config.sanitiseKeys(arg) : prefix
			attrs['kv.list_prefix'] = sanitisedPrefex
		}
		attrs['kv.list_request_cursor'] = cursor || undefined
		attrs['kv.list_limit'] = limit || undefined
		const { list_complete } = result as KVNamespaceListResult<any, any>
		attrs['kv.list_complete'] = limit || undefined
		if (!list_complete) {
			attrs['kv.list_response_cursor'] = cursor || undefined
		}
		return attrs
	},
	put(config, name, argArray) {
		const originalKey = argArray[0]
		const arg = { namespace: name, key: originalKey }
		const key: string = config.sanitiseKeys ? config.sanitiseKeys(arg) : originalKey
		const attrs: Attributes = {
			'kv.key': key,
		}
		if (argArray.length > 2 && argArray[2]) {
			const { expiration, expirationTtl, metadata } = argArray[2] as KVNamespacePutOptions
			attrs['kv.expiration'] = expiration
			attrs['kv.expirationTtl'] = expirationTtl
			attrs['kv.withMetadata'] = !!metadata
		}
		return attrs
	},
}

const instrumentKV = (kv: KVNamespace, name: string, config: KVExtendedConfig): KVNamespace => {
	const tracer = trace.getTracer('KV')
	return new Proxy(kv, {
		get: (target, prop, receiver) => {
			const operation = String(prop)
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
						})
						const result = await Reflect.apply(target, kv, argArray)
						const extraAttrs = KVAttributes[prop] ? KVAttributes[prop](config, name, argArray, result) : {}
						span.setAttributes(extraAttrs)
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

const isQueue = (item: unknown): item is Queue => {
	return !!(item as Queue).sendBatch
}

const instrumentEnv = (env: Record<string, unknown>, config: BindingsConfig): Record<string, unknown> => {
	return new Proxy(env, {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item)) {
				if (typeof config.kv !== 'boolean' && typeof prop === 'string') {
					return instrumentKV(item, prop, config.kv)
				}
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop), {})
			}
			return item
		},
	})
}

export { instrumentEnv }
