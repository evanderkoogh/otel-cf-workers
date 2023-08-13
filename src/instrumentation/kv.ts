import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap.js'

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
			attrs['kv.type'] = opts
		} else if (typeof opts === 'object') {
			attrs['kv.type'] = opts.type
			attrs['kv.cacheTtl'] = opts.cacheTtl
		}
		return attrs
	},
	getWithMetadata(argArray, result) {
		const attrs = this.get(argArray, result)
		attrs['kv.withMetadata'] = true
		const { cacheStatus } = result as KVNamespaceGetWithMetadataResult<any, any>
		if (typeof cacheStatus === 'string') {
		  attrs['kv.cacheStatus'] = cacheStatus
		}
		return attrs
	},
	list(argArray, result) {
		const attrs: Attributes = {}
		const opts: KVNamespaceListOptions = argArray[0] || {}
		const { cursor, limit, prefix } = opts
		attrs['kv.list_prefix'] = prefix || undefined
		attrs['kv.list_request_cursor'] = cursor || undefined
		attrs['kv.list_limit'] = limit || undefined
		const { list_complete, cacheStatus } = result as KVNamespaceListResult<any, any>
		attrs['kv.list_complete'] = list_complete || undefined
		if (!list_complete) {
			attrs['kv.list_response_cursor'] = cursor || undefined
		}
		if (typeof cacheStatus === 'string') {
		  attrs['kv.cacheStatus'] = cacheStatus
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

function instrumentKVFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('KV')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes: {
					binding_type: 'KV',
					kv_namespace: name,
					operation,
				},
			}
			return tracer.startActiveSpan(`kv:${name}:${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrs = KVAttributes[operation] ? KVAttributes[operation](argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.setAttribute('hasResult', !!result)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentKV(kv: KVNamespace, name: string): KVNamespace {
	const kvHandler: ProxyHandler<KVNamespace> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentKVFn(fn, name, operation)
		},
	}
	return wrap(kv, kvHandler)
}
