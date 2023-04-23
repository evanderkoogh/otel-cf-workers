import { getActiveConfig } from '../config'
import { wrap } from './common'
import { instrumentDOBinding } from './do'
import { instrumentKV } from './kv'
import { instrumentQueueSender } from './queue'

const isKVNamespace = (item: unknown): item is KVNamespace => {
	return !!(item as KVNamespace).getWithMetadata
}

const isQueue = (item: unknown): item is Queue => {
	return !!(item as Queue).sendBatch
}

const isDurableObject = (item: unknown): item is DurableObjectNamespace => {
	return !!(item as DurableObjectNamespace).idFromName
}

const instrumentEnv = (env: Record<string, unknown>): Record<string, unknown> => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const config = getActiveConfig()?.bindings
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item)) {
				if (config && typeof config.kv !== 'boolean' && typeof prop === 'string') {
					return instrumentKV(item, prop)
				}
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isDurableObject(item)) {
				return instrumentDOBinding(item, String(prop), {})
			}
			return item
		},
	}
	return wrap(env, envHandler)
}

export { instrumentEnv }
