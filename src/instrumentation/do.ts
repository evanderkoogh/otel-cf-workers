import { trace, SpanOptions, SpanKind, Exception } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { loadConfig, PartialTraceConfig } from '../config'
import { init } from '../sdk'
import { WorkerTracer } from '../tracer'
import { wrap } from './common'
import { instrumentEnv } from './env'
import {
	getParentContextFromHeaders,
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
} from './fetch'
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
									const attrs = {
										name: `durable_object:${nsName}`,
										'do.namespace': nsName,
										'do.id': target.id.toString(),
										'do.id.name': target.id.name,
									}
									return instrumentFetcher(fetcher, () => ({ includeTraceContext: true }), attrs)
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

function instrumentState(state: DurableObjectState, config: {}) {
	const stateHandler: ProxyHandler<DurableObjectState> = {
		get(target, prop) {
			const result = Reflect.get(target, prop)
			if (typeof result === 'function') {
				result.bind(target)
			}
			return result
		},
	}
	return wrap(state, stateHandler)
}

async function flush() {
	const tracer = trace.getTracer('export')
	if (tracer instanceof WorkerTracer) {
		await scheduler.wait(1)
		await tracer.spanProcessor.forceFlush()
	} else {
		console.error('The global tracer is not of type WorkerTracer and can not export spans')
	}
}

let cold_start = true
export type DOClass = { new (state: DurableObjectState, env: any): DurableObject }
export function instrumentDO(doClass: DOClass, config: PartialTraceConfig): DOClass {
	const classHandler: ProxyHandler<DOClass> = {
		construct(target, argArray: ConstructorParameters<DOClass>) {
			const state = instrumentState(argArray[0], {})
			argArray[0] = state
			const doId = state.id.toString()
			const doName = state.id.name
			const env = argArray[1]
			const conf = loadConfig(config, env)
			init(conf)
			argArray[1] = instrumentEnv(env, conf.bindings)
			const doObj = new target(...argArray)
			const objHandler: ProxyHandler<DurableObject> = {
				get(target, prop) {
					if (prop === 'fetch') {
						const fetchHandler: ProxyHandler<DurableObject['fetch']> = {
							apply(target, thisArg, argArray) {
								const request = argArray[0]
								const spanContext = getParentContextFromHeaders(request.headers)

								const tracer = trace.getTracer('do.fetch')
								const options: SpanOptions = {
									kind: SpanKind.SERVER,
									attributes: {
										'do.id': doId,
										'do.name': doName,
									},
								}

								const promise = tracer.startActiveSpan('do.fetch', options, spanContext, async (span) => {
									span.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'http')
									span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
									cold_start = false

									span.setAttributes(gatherRequestAttributes(request))
									span.setAttributes(gatherIncomingCfAttributes(request))

									try {
										const response: Response = await Reflect.apply(target, thisArg, argArray)
										span.setAttributes(gatherResponseAttributes(response))
										span.end()

										return response
									} catch (error) {
										span.recordException(error as Exception)
										span.end()
										throw error
									} finally {
										flush()
									}
								})
								return promise
							},
						}
						const fn = Reflect.get(target, prop)
						return wrap(fn, fetchHandler)
					} else {
						return Reflect.get(target, prop)
					}
				},
			}
			return wrap(doObj, objHandler)
		},
	}
	return wrap(doClass, classHandler)
}
