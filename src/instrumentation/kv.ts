import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare KV'

const KVAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(_argArray) {
		return {}
	},
	get(argArray) {
		const attrs: Attributes = {}
		const opts = argArray[1]
		if (typeof opts === 'string') {
			attrs['db.cf.kv.type'] = opts
		} else if (typeof opts === 'object') {
			attrs['db.cf.kv.type'] = opts.type
			attrs['db.cf.kv.cache_ttl'] = opts.cacheTtl
		}
		return attrs
	},
	getWithMetadata(argArray, result) {
		const attrs = this['get']!(argArray, result)
		attrs['db.cf.kv.metadata'] = true
		const { cacheStatus } = result as KVNamespaceGetWithMetadataResult<any, any>
		if (typeof cacheStatus === 'string') {
			attrs['db.cf.kv.cache_status'] = cacheStatus
		}
		return attrs
	},
	list(argArray, result) {
		const attrs: Attributes = {}
		const opts: KVNamespaceListOptions = argArray[0] || {}
		const { cursor, limit } = opts
		attrs['db.cf.kv.list_request_cursor'] = cursor || undefined
		attrs['db.cf.kv.list_limit'] = limit || undefined
		const { list_complete, cacheStatus } = result as KVNamespaceListResult<any, any>
		attrs['db.cf.kv.list_complete'] = list_complete || undefined
		if (!list_complete) {
			attrs['db.cf.kv.list_response_cursor'] = cursor || undefined
		}
		if (typeof cacheStatus === 'string') {
			attrs['db.cf.kv.cache_status'] = cacheStatus
		}
		return attrs
	},
	put(argArray) {
		const attrs: Attributes = {}
		if (argArray.length > 2 && argArray[2]) {
			const { expiration, expirationTtl, metadata } = argArray[2] as KVNamespacePutOptions
			attrs['db.cf.kv.expiration'] = expiration
			attrs['db.cf.kv.expiration_ttl'] = expirationTtl
			attrs['db.cf.kv.metadata'] = !!metadata
		}
		return attrs
	},
}

function instrumentKVFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('KV')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				binding_type: 'KV',
				[SemanticAttributes.DB_NAME]: name,
				[SemanticAttributes.DB_SYSTEM]: dbSystem,
				[SemanticAttributes.DB_OPERATION]: operation,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`${name} ${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = KVAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)
				if (operation === 'list') {
					const opts: KVNamespaceListOptions = argArray[0] || {}
					const { prefix } = opts
					span.setAttribute(SemanticAttributes.DB_STATEMENT, `${operation} ${prefix || undefined}`)
				} else {
					span.setAttribute(SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`)
					span.setAttribute('db.cf.kv.key', argArray[0])
				}
				span.setAttribute('db.cf.kv.has_result', !!result)
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
