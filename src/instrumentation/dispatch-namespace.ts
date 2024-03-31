import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { passthroughGet, wrap } from '../wrap.js'
import { instrumentClientFetch } from './fetch.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const WFPAttributes: Record<string | symbol, ExtraAttributeFn> = {
	get(argArray) {
		const attrs: Attributes = {}
		const name = argArray[0]
		const opts = argArray[2]
		attrs['wfp.script_name'] = name
		if (typeof opts === 'object') {
			const limits = opts.limits
			if (typeof limits === 'object') {
				const { cpuMs, subRequests } = limits
				if (typeof cpuMs === 'number') {
					attrs['wfp.limits.cpuMs'] = cpuMs
				}
				if (typeof subRequests === 'number') {
					attrs['wfp.limits.subRequests'] = subRequests
				}
			}
		}
		return attrs
	},
}

function instrumentWFPFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('WorkersForPlatforms')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				binding_type: 'WorkersForPlatforms',
				[SemanticAttributes.CODE_NAMESPACE]: name,
			}
			const options: SpanOptions = {
				kind: SpanKind.INTERNAL,
				attributes,
			}
			return tracer.startActiveSpan(`${name} ${operation}`, options, async (span) => {
				const result: Fetcher = await Reflect.apply(target, thisArg, argArray)
				const extraAttrs = WFPAttributes[operation] ? WFPAttributes[operation](argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.end()
				return instrumentUserWorkerFetcher(result, name, argArray[0])
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentDispatchNamespace(dataset: DispatchNamespace, name: string): DispatchNamespace {
	const datasetHandler: ProxyHandler<DispatchNamespace> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentWFPFn(fn, name, operation)
		},
	}
	return wrap(dataset, datasetHandler)
}

export function instrumentUserWorkerFetcher(
	fetcher: Fetcher,
	dispatch_namespace: string,
	worker_name: string,
): Fetcher {
	const fetcherHandler: ProxyHandler<Fetcher> = {
		get(target, prop) {
			if (prop === 'fetch') {
				const fetcher = Reflect.get(target, prop)
				const attrs = {
					dispatch_namespace,
					worker_name,
				}
				return instrumentClientFetch(fetcher, () => ({ includeTraceContext: false }), attrs)
			} else {
				return passthroughGet(target, prop)
			}
		},
	}
	return wrap(fetcher, fetcherHandler)
}
