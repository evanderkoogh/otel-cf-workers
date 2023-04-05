import { trace } from '@opentelemetry/api'
import { WorkerTraceConfig } from '../config'
import { isWrapped, sanitiseURL, unwrap, wrap } from './common'

type CacheFns = Cache[keyof Cache]

const tracer = trace.getTracer('cache instrumentation')

function instrumentFunction<T extends CacheFns>(fn: T, cacheName: string, op: string, _config: WorkerTraceConfig): T {
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

function instrumentCache(cache: Cache, cacheName: string, config: WorkerTraceConfig): Cache {
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

function instrumentOpen(openFn: CacheStorage['open'], config: WorkerTraceConfig): CacheStorage['open'] {
	const handler: ProxyHandler<typeof openFn> = {
		async apply(target, thisArg, argArray) {
			const cacheName = argArray[0]
			const cache = await Reflect.apply(target, thisArg, argArray)
			return instrumentCache(cache, cacheName, config)
		},
	}
	return wrap(openFn, handler)
}

export function instrumentGlobalCache(config: WorkerTraceConfig) {
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
