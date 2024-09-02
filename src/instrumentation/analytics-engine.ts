import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import {
	SEMATTRS_DB_NAME,
	SEMATTRS_DB_OPERATION,
	SEMATTRS_DB_STATEMENT,
	SEMATTRS_DB_SYSTEM,
} from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare Analytics Engine'

const AEAttributes: Record<string | symbol, ExtraAttributeFn> = {
	writeDataPoint(argArray) {
		const attrs: Attributes = {}
		const opts = argArray[0]
		if (typeof opts === 'object') {
			attrs['db.cf.ae.indexes'] = opts.indexes.length
			attrs['db.cf.ae.index'] = (opts.indexes[0] as ArrayBuffer | string).toString()
			attrs['db.cf.ae.doubles'] = opts.doubles.length
			attrs['db.cf.ae.blobs'] = opts.blobs.length
		}
		return attrs
	},
}

function instrumentAEFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('AnalyticsEngine')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				binding_type: 'AnalyticsEngine',
				[SEMATTRS_DB_NAME]: name,
				[SEMATTRS_DB_SYSTEM]: dbSystem,
				[SEMATTRS_DB_OPERATION]: operation,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Analytics Engine ${name} ${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = AEAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.setAttribute(SEMATTRS_DB_STATEMENT, `${operation} ${argArray[0]}`)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentAnalyticsEngineDataset(
	dataset: AnalyticsEngineDataset,
	name: string,
): AnalyticsEngineDataset {
	const datasetHandler: ProxyHandler<AnalyticsEngineDataset> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentAEFn(fn, name, operation)
		},
	}
	return wrap(dataset, datasetHandler)
}
