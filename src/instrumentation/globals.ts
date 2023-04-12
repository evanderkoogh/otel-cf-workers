import { Attributes, context, propagation, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { isWrapped } from '@opentelemetry/core'
import { GlobalsConfig, PartialTraceConfig } from '../config'
import { gatherRequestAttributes, gatherResponseAttributes, sanitiseURL, unwrap, wrap } from './common'

type CacheFns = Cache[keyof Cache]
type CacheConfig = GlobalsConfig['caches']
type FetchConfig = GlobalsConfig['fetch']

const tracer = trace.getTracer('cache instrumentation')

function instrumentFunction<T extends CacheFns>(fn: T, cacheName: string, op: string, config: CacheConfig): T {
	const handler: ProxyHandler<typeof fn> = {
		apply(target, thisArg, argArray) {
			return tracer.startActiveSpan(`cache:${cacheName}:${op}`, async (span) => {
				span.setAttribute('cache.name', cacheName)
				if (argArray[0].url) {
					span.setAttribute('http.url', sanitiseURL(argArray[0].url))
				}
				const result = await Reflect.apply(target, thisArg, argArray)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

function instrumentCache(cache: Cache, cacheName: string, config: CacheConfig): Cache {
	const handler: ProxyHandler<typeof cache> = {
		get(target, prop) {
			if (prop === 'delete' || prop === 'match' || prop === 'put') {
				const fn = Reflect.get(target, prop).bind(target)
				return instrumentFunction(fn, cacheName, prop, config)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	return wrap(cache, handler)
}

function instrumentOpen(openFn: CacheStorage['open'], config: CacheConfig): CacheStorage['open'] {
	const handler: ProxyHandler<typeof openFn> = {
		async apply(target, thisArg, argArray) {
			const cacheName = argArray[0]
			const cache = await Reflect.apply(target, thisArg, argArray)
			return instrumentCache(cache, cacheName, config)
		},
	}
	return wrap(openFn, handler)
}

function _instrumentGlobalCache(config: CacheConfig) {
	const handler: ProxyHandler<typeof caches> = {
		get(target, prop) {
			if (prop === 'default') {
				const cache = target.default
				return instrumentCache(cache, 'default', config)
			} else if (prop === 'open') {
				const openFn = Reflect.get(target, prop).bind(target)
				return instrumentOpen(openFn, config)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	//@ts-ignore
	globalThis.caches = wrap(caches, handler)
}

export function instrumentGlobalCache(config: CacheConfig) {
	if (config) {
		return _instrumentGlobalCache(config)
	}
}

const gatherOutgoingCfAttributes = (cf: RequestInitCfProperties): Attributes => {
	const attrs: Record<string, string | number> = {}
	Object.keys(cf).forEach((key) => {
		const value = cf[key]
		if (typeof value === 'string' || typeof value === 'number') {
			attrs[`cf.${key}`] = value
		} else {
			attrs[`cf.${key}`] = JSON.stringify(value)
		}
	})
	return attrs
}

export function instrumentFetcher(
	config: FetchConfig,
	fetcher: Fetcher['fetch'],
	attrs?: Attributes
): Fetcher['fetch'] {
	const handler: ProxyHandler<typeof fetch> = {
		apply: (target, thisArg, argArray): ReturnType<typeof fetch> => {
			if (isWrapped(thisArg)) {
				thisArg = unwrap(thisArg)
			}
			const tracer = trace.getTracer('fetcher')
			const options: SpanOptions = { kind: SpanKind.CLIENT, attributes: attrs }

			const request = new Request(argArray[0], argArray[1])
			const host = new URL(request.url).host
			const spanName = typeof attrs?.['name'] === 'string' ? attrs?.['name'] : `fetch: ${host}`
			const promise = tracer.startActiveSpan(spanName, options, async (span) => {
				if (config && config.includeTraceContext) {
					propagation.inject(context.active(), request.headers, {
						set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
					})
				}
				span.setAttributes(gatherRequestAttributes(request))
				if (request.cf) span.setAttributes(gatherOutgoingCfAttributes(request.cf))
				const response: Response = await Reflect.apply(target, thisArg, [request])
				span.setAttributes(gatherResponseAttributes(response))
				span.end()
				return response
			})
			return promise
		},
	}
	return wrap(fetcher, handler)
}

export function instrumentGlobalFetch(config: FetchConfig): void {
	if (config) {
		globalThis.fetch = instrumentFetcher(config, fetch)
	}
}
