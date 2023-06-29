import { getActiveConfig } from '../config'
import { wrap } from './wrap'
import { instrumentDOBinding } from './do'
import { instrumentKV } from './kv'
import { instrumentQueueSender } from './queue'
import { BindingsConfig } from '../types'

const isKVNamespace = (item: unknown | undefined): item is KVNamespace => {
	return typeof item !== 'undefined' && !!(item as KVNamespace).getWithMetadata
}

const isQueue = (item: unknown | undefined): item is Queue => {
	return typeof item !== 'undefined' && !!(item as Queue).sendBatch
}

const isDurableObject = (item: unknown | undefined): item is DurableObjectNamespace => {
	return typeof item !== 'undefined' && !!(item as DurableObjectNamespace).idFromName
}

function shouldInstrumentKv(config?: BindingsConfig): boolean {
	const kvConfig = config?.kv
	return !(typeof kvConfig === 'boolean' && kvConfig === false)
}

const instrumentEnv = (env: Record<string, unknown>): Record<string, unknown> => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const config = getActiveConfig()?.bindings
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item) && shouldInstrumentKv(config)) {
				return instrumentKV(item, String(prop))
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isDurableObject(item)) {
				return instrumentDOBinding(item, String(prop))
			} else {
				return item
			}
		},
	}
	return wrap(env, envHandler)
}

export { instrumentEnv }
