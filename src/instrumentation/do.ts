import { isWrapped, unwrap, wrap } from './common'
import { instrumentFetcher } from './globals'

type DOBindingsConfigs = {}

export function instrumentDurableObject(ns: DurableObjectNamespace, nsName: string, _config: DOBindingsConfigs) {
	const nsHandler: ProxyHandler<typeof ns> = {
		get(target, prop, receiver) {
			if (prop === 'get') {
				const fn = Reflect.get(ns, prop)
				const getHandler: ProxyHandler<DurableObjectNamespace['get']> = {
					apply(target, thisArg, argArray) {
						const stub: DurableObjectStub = Reflect.apply(target, thisArg, argArray)
						const stubHandler: ProxyHandler<typeof stub> = {
							get(target, prop) {
								if (prop === 'fetch') {
									const fetcher = Reflect.get(target, prop)
									const config = { includeTraceContext: true }
									const attrs = {
										name: `durable_object:${nsName}`,
										'do.namespace': nsName,
										'do.id': target.id.toString(),
										'do.id.name': target.id.name,
									}
									return instrumentFetcher(config, fetcher, attrs)
								} else {
									return Reflect.get(target, prop)
								}
							},
						}
						return wrap(stub, stubHandler)
					},
				}
				return wrap(fn, getHandler)
			} else {
				const result = Reflect.get(target, prop, receiver)
				if (typeof result === 'function') {
					const handler: ProxyHandler<any> = {
						apply(target, thisArg, argArray) {
							if (isWrapped(thisArg)) {
								thisArg = unwrap(thisArg)
							}
							return Reflect.apply(target, thisArg, argArray)
						},
					}
					return wrap(result, handler)
				}
				return result
			}
		},
	}
	return wrap(ns, nsHandler)
}
