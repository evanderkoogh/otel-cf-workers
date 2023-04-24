import { trace, SpanOptions, SpanKind, Exception, SpanStatusCode } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from './common'
import {
	getParentContextFromHeaders,
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
	instrumentFetcher,
} from './fetch'

type DOBindingsConfigs = {}
type FetchFn = DurableObject['fetch']
type AlarmFn = NonNullable<DurableObject['alarm']>

export function instrumentDOBinding(ns: DurableObjectNamespace, nsName: string, _config: DOBindingsConfigs) {
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

export function instrumentState(state: DurableObjectState) {
	const stateHandler: ProxyHandler<DurableObjectState> = {
		get(target, prop) {
			const result = Reflect.get(target, prop)
			if (typeof result === 'function') {
				return result.bind(target)
			}
			return result
		},
	}
	return wrap(state, stateHandler)
}

let cold_start = true
export type DOClass = { new (state: DurableObjectState, env: any): DurableObject }
export function executeDOFetch(fetchFn: FetchFn, request: Request, id: DurableObjectId): Promise<Response> {
	const spanContext = getParentContextFromHeaders(request.headers)

	const tracer = trace.getTracer('DO fetchHandler')
	const options: SpanOptions = {
		kind: SpanKind.SERVER,
		attributes: {
			'do.id': id.toString(),
			'do.name': id.name,
		},
	}

	const name = id.name || ''
	const promise = tracer.startActiveSpan(`do.fetchHandler:${name}`, options, spanContext, async (span) => {
		span.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'http')
		span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
		cold_start = false

		span.setAttributes(gatherRequestAttributes(request))
		span.setAttributes(gatherIncomingCfAttributes(request))

		try {
			const response: Response = await fetchFn(request)
			if (response.ok) {
				span.setStatus({ code: SpanStatusCode.OK })
			}
			span.setAttributes(gatherResponseAttributes(response))
			span.end()

			return response
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
		}
	})
	return promise
}

export function executeDOAlarm(alarmFn: AlarmFn, id: DurableObjectId): Promise<void> {
	const tracer = trace.getTracer('DO alarmHandler')

	const name = id.name || ''
	const promise = tracer.startActiveSpan(`do.alarmHandler:${name}`, async (span) => {
		span.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'http')
		span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
		cold_start = false
		span.setAttribute('do.id', id.toString())
		if (id.name) span.setAttribute('do.name', id.name)

		try {
			await alarmFn()
			span.end()
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
		}
	})
	return promise
}
