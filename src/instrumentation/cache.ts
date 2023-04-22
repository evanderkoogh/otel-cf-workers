import { trace } from '@opentelemetry/api'
import { getActiveConfig } from '../config'
import { wrap } from './common'
import { sanitiseURL } from './fetch'

type CacheFns = Cache[keyof Cache]

const tracer = trace.getTracer('cache instrumentation')

function instrumentFunction<T extends CacheFns>(fn: T, cacheName: string, op: string): T {
	const handler: ProxyHandler<typeof fn> = {
		async apply(target, thisArg, argArray) {
			const config = getActiveConfig()
			if (!config?.globals.caches) {
				return await Reflect.apply(target, thisArg, argArray)
			}

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

function instrumentCache(cache: Cache, cacheName: string): Cache {
	const handler: ProxyHandler<typeof cache> = {
		get(target, prop) {
			if (prop === 'delete' || prop === 'match' || prop === 'put') {
				const fn = Reflect.get(target, prop).bind(target)
				return instrumentFunction(fn, cacheName, prop)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	return wrap(cache, handler)
}

function instrumentOpen(openFn: CacheStorage['open']): CacheStorage['open'] {
	const handler: ProxyHandler<typeof openFn> = {
		async apply(target, thisArg, argArray) {
			const cacheName = argArray[0]
			const cache = await Reflect.apply(target, thisArg, argArray)
			return instrumentCache(cache, cacheName)
		},
	}
	return wrap(openFn, handler)
}

function _instrumentGlobalCache() {
	const handler: ProxyHandler<typeof caches> = {
		get(target, prop) {
			if (prop === 'default') {
				const cache = target.default
				return instrumentCache(cache, 'default')
			} else if (prop === 'open') {
				const openFn = Reflect.get(target, prop).bind(target)
				return instrumentOpen(openFn)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	//@ts-ignore
	globalThis.caches = wrap(caches, handler)
}

export function instrumentGlobalCache() {
	const config = getActiveConfig()
	if (config?.globals.caches) {
		return _instrumentGlobalCache()
	}
}
