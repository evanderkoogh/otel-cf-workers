import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from './wrap'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const KVAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(argArray) {
		return {
			'kv.key': argArray[0],
		}
	},
	get(argArray) {
		const attrs: Attributes = {
			'kv.key': argArray[0],
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
	getWithMetadata(argArray, result) {
		const attrs = this.get(argArray, result)
		attrs['withMetadata'] = true
		return attrs
	},
	list(argArray, result) {
		const attrs: Attributes = {}
		const opts: KVNamespaceListOptions = argArray[0] || {}
		const { cursor, limit, prefix } = opts
		attrs['kv.list_prefix'] = prefix || undefined
		attrs['kv.list_request_cursor'] = cursor || undefined
		attrs['kv.list_limit'] = limit || undefined
		const { list_complete } = result as KVNamespaceListResult<any, any>
		attrs['kv.list_complete'] = limit || undefined
		if (!list_complete) {
			attrs['kv.list_response_cursor'] = cursor || undefined
		}
		return attrs
	},
	put(argArray) {
		const attrs: Attributes = {
			'kv.key': argArray[0],
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

export function instrumentKV(kv: KVNamespace, name: string): KVNamespace {
	const tracer = trace.getTracer('KV')
	const kvHandler: ProxyHandler<KVNamespace> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			const fnHandler: ProxyHandler<any> = {
				apply: (target, _thisArg, argArray) => {
					const options: SpanOptions = {
						kind: SpanKind.CLIENT,
					}
					return tracer.startActiveSpan(`kv:${name}:${operation}`, options, async (span) => {
						span.setAttributes({
							binding_type: 'KV',
							kv_namespace: name,
							operation,
						})
						const result = await Reflect.apply(target, kv, argArray)
						const extraAttrs = KVAttributes[prop] ? KVAttributes[prop](argArray, result) : {}
						span.setAttributes(extraAttrs)
						span.setAttribute('hasResult', !!result)
						span.end()
						return result
					})
				},
			}
			return wrap(fn, fnHandler)
		},
	}
	return wrap(kv, kvHandler)
}
