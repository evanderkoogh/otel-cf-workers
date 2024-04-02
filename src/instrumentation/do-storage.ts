import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare DO'

const StorageAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(argArray, result) {
		let attrs = {} as Record<string, string | number | boolean | undefined>
		if (Array.isArray(argArray[0])) {
			const keys = argArray[0]
			attrs = {
				'db.cf.do.key': keys[0],
				'db.cf.do.number_of_keys': keys.length,
				'db.cf.do.keys_deleted': result,
			}
		} else {
			attrs = {
				'db.cf.do.key': argArray[0],
				'db.cf.do.success': result,
			}
		}
		if (argArray.length > 1) {
			const options = argArray[1] as DurableObjectPutOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('allowUnconfirmed' in options) {
				attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
			}
			if ('noCache' in options) {
				attrs['db.cf.do.no_cache'] = options.noCache
			}
		}
		return attrs
	},
	deleteAll(argArray) {
		let attrs = {} as Record<string, string | number | boolean | undefined>
		if (argArray.length > 0) {
			const options = argArray[0] as DurableObjectPutOptions
			if ('allowUnconfirmed' in options) {
				attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
			}
			if ('noCache' in options) {
				attrs['db.cf.do.no_cache'] = options.noCache
			}
		}
		return attrs
	},
	get(argArray) {
		let attrs = {} as Record<string, string | number | boolean | undefined>
		if (Array.isArray(argArray[0])) {
			const keys = argArray[0]
			attrs = {
				'db.cf.do.key': keys[0],
				'db.cf.do.number_of_keys': keys.length,
			}
		} else {
			attrs = {
				'db.cf.do.key': argArray[0],
			}
		}
		if (argArray.length > 1) {
			const options = argArray[1] as DurableObjectGetOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('noCache' in options) {
				attrs['db.cf.do.no_cache'] = options.noCache
			}
		}
		return attrs
	},
	list(argArray, result: Map<string, unknown>) {
		const attrs: Attributes = {
			'db.cf.do.number_of_results': result.size,
		} as Record<string, string | number | boolean | undefined>
		if (argArray.length > 0) {
			const options = argArray[0] as DurableObjectListOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('noCache' in options) {
				attrs['db.cf.do.no_cache'] = options.noCache
			}
			if ('start' in options) {
				attrs['db.cf.do.start'] = options.start
			}
			if ('startAfter' in options) {
				attrs['db.cf.do.start_after'] = options.startAfter
			}
			if ('end' in options) {
				attrs['db.cf.do.end'] = options.end
			}
			if ('prefix' in options) {
				attrs['db.cf.do.prefix'] = options.prefix
			}
			if ('reverse' in options) {
				attrs['db.cf.do.reverse'] = options.reverse
			}
			if ('limit' in options) {
				attrs['db.cf.do.limit'] = options.limit
			}
		}
		return attrs
	},
	put(argArray) {
		const attrs = {
			'db.cf.do.key': argArray[0],
		} as Record<string, string | number | boolean | undefined>

		if (typeof argArray[0] === 'string') {
			attrs['db.cf.do.key'] = argArray[0]
		} else {
			const keys = Object.keys(argArray[0])
			attrs['db.cf.do.key'] = keys[0]
			attrs['db.cf.do.number_of_keys'] = keys.length
		}

		const optionsIndex = typeof argArray[1] === 'object' ? 1 : 2

		if (argArray.length > optionsIndex) {
			const options = argArray[optionsIndex] as DurableObjectPutOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('allowUnconfirmed' in options) {
				attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
			}
			if ('noCache' in options) {
				attrs['db.cf.do.no_cache'] = options.noCache
			}
		}
		return attrs
	},
	getAlarm(argArray) {
		let attrs = {} as Record<string, string | number | boolean | undefined>
		if (argArray.length > 0) {
			const options = argArray[0] as DurableObjectPutOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
		}
		return attrs
	},
	setAlarm(argArray) {
		const attrs = {} as Record<string, string | number | boolean | undefined>
		if (argArray[0] instanceof Date) {
			attrs['db.cf.do.alarm_time'] = argArray[0].getTime()
		} else {
			attrs['db.cf.do.alarm_time'] = argArray[0]
		}
		if (argArray.length > 1) {
			const options = argArray[1] as DurableObjectSetAlarmOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('allowUnconfirmed' in options) {
				attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
			}
		}
		return attrs
	},
	deleteAlarm(argArray) {
		const attrs = {} as Record<string, string | number | boolean | undefined>
		if (argArray.length > 0) {
			const options = argArray[0] as DurableObjectSetAlarmOptions
			if ('allowConcurrency' in options) {
				attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
			}
			if ('allowUnconfirmed' in options) {
				attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
			}
		}
		return attrs
	},
}

function instrumentStorageFn(fn: Function, operation: string) {
	const tracer = trace.getTracer('do_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				[SemanticAttributes.DB_SYSTEM]: dbSystem,
				[SemanticAttributes.DB_OPERATION]: operation,
				[SemanticAttributes.DB_STATEMENT]: `${operation} ${argArray[0]}`,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes: {
					...attributes,
					operation,
				},
			}
			return tracer.startActiveSpan(`do:storage:${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = StorageAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.setAttribute('db.cf.do.has_result', !!result)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentStorage(storage: DurableObjectStorage): DurableObjectStorage {
	const storageHandler: ProxyHandler<DurableObjectStorage> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentStorageFn(fn, operation)
		},
	}
	return wrap(storage, storageHandler)
}
