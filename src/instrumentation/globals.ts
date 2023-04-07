import { Attributes, context, propagation, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { PartialTraceConfig } from '../config'
import { gatherRequestAttributes, gatherResponseAttributes, sanitiseURL, wrap } from './common'

type CacheFns = Cache[keyof Cache]

const tracer = trace.getTracer('cache instrumentation')

function instrumentFunction<T extends CacheFns>(fn: T, cacheName: string, op: string, _config: PartialTraceConfig): T {
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

function instrumentCache(cache: Cache, cacheName: string, config: PartialTraceConfig): Cache {
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

function instrumentOpen(openFn: CacheStorage['open'], config: PartialTraceConfig): CacheStorage['open'] {
	const handler: ProxyHandler<typeof openFn> = {
		async apply(target, thisArg, argArray) {
			const cacheName = argArray[0]
			const cache = await Reflect.apply(target, thisArg, argArray)
			return instrumentCache(cache, cacheName, config)
		},
	}
	return wrap(openFn, handler)
}

export function instrumentGlobalCache(config: PartialTraceConfig) {
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

export function instrumentGlobalFetch(_config: PartialTraceConfig): void {
	const handler: ProxyHandler<typeof fetch> = {
		apply: (target, thisArg, argArray): ReturnType<typeof fetch> => {
			const tracer = trace.getTracer('fetch')
			const options: SpanOptions = { kind: SpanKind.CLIENT }

			const request = new Request(argArray[0], argArray[1])
			const host = new URL(request.url).host
			const promise = tracer.startActiveSpan(`fetch: ${host}`, options, async (span) => {
				propagation.inject(context.active(), request.headers, {
					set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
				})
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
	globalThis.fetch = wrap(fetch, handler)
}
