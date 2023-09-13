import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare DO'

const StorageAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(argArray, result) {
		let attrs = {}
		if (Array.isArray(argArray[0])) {
			const keys = argArray[0]
			attrs = {
				'db.cf.key': keys[0],
				'db.cf.number_of_keys': keys.length,
				'db.cf.keys_deleted': result,
			}
		} else {
			attrs = {
				'db.cf.key': argArray[0],
				'db.cf.success': result,
			}
		}
		if (argArray.length > 1) {
			Object.assign(attrs, argArray[1])
		}
		return attrs
	},
	get(argArray) {
		let attrs = {}
		if (Array.isArray(argArray[0])) {
			const keys = argArray[0]
			attrs = {
				'db.cf.key': keys[0],
				'db.cf.number_of_keys': keys.length,
			}
		} else {
			attrs = {
				'db.cf.key': argArray[0],
			}
		}
		if (argArray.length > 1) {
			Object.assign(attrs, argArray[1])
		}
		return attrs
	},
	list(argArray, result: Map<string, unknown>) {
		// list may be called with no arguments
		const attrs: Attributes = {
			'db.cf.number_of_results': result.size,
		}
		Object.assign(attrs, argArray[0])
		return attrs
	},
	put(argArray) {
		const attrs = {
			'db.cf.key': argArray[0],
		}

		if (argArray.length > 2) {
			Object.assign(attrs, argArray[2])
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
					operation,
				},
			}
			return tracer.startActiveSpan(`do:storage:${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrs = StorageAttributes[operation] ? StorageAttributes[operation](argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.setAttribute('db.cf.hasResult', !!result)
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
