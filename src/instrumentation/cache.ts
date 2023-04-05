import { trace } from '@opentelemetry/api'
import { WorkerTraceConfig } from '../config'
import { sanitiseURL, wrap } from './common'

type CacheFns = Cache[keyof Cache]

const tracer = trace.getTracer('cache instrumentation')

function instrumentFunction<T extends CacheFns>(fn: T, cacheName: string, config: WorkerTraceConfig): T {
	return new Proxy(fn, {
		apply(target, thisArg, argArray) {
			return tracer.startActiveSpan(`cache:${cacheName}:${fn.name}`, (span) => {
				span.setAttribute('cache.name', cacheName)
				if (argArray[0].url) {
					span.setAttribute('http.url', sanitiseURL(argArray[0].url))
				}
				const result = Reflect.apply(target, thisArg, argArray)
				span.end()
				return result
			})
		},
	})
}

function instrumentCache(cache: Cache, cacheName: string, config: WorkerTraceConfig): Cache {
	return new Proxy(cache, {
		get(target, prop) {
			const fn = Reflect.get(target, prop)
			return instrumentFunction(fn, cacheName, config)
		},
	})
}

function instrumentOpen(openFn: CacheStorage['open'], config: WorkerTraceConfig): CacheStorage['open'] {
	return new Proxy(openFn, {
		async apply(target, thisArg, argArray) {
			const cacheName = argArray[0]
			return tracer.startActiveSpan(`cache:open:${cacheName}`, async (span) => {
				const cache = await Reflect.apply(target, thisArg, argArray)
				span.end()
				return instrumentCache(cache, cacheName, config)
			})
		},
	})
}

export function instrumentGlobalCache(config: WorkerTraceConfig) {
	const handler: ProxyHandler<typeof caches> = {
		get(target, prop) {
			if (prop === 'default') {
				const cache = Reflect.get(target, prop)
				return instrumentCache(cache, 'default', config)
			} else if (prop === 'open') {
				const openFn = Reflect.get(target, prop)
				return instrumentOpen(openFn, config)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	//@ts-ignore
	globalThis.caches = wrap(caches, handler)
}
