import { WorkerTraceConfig } from '../config'
import { instrumentDurableObject } from './do'
import { instrumentKV } from './kv'
import { instrumentQueueSender } from './queue'

type BindingsConfig = WorkerTraceConfig['bindings']

const isKVNamespace = (item: unknown): item is KVNamespace => {
	return !!(item as KVNamespace).getWithMetadata
}

const isQueue = (item: unknown): item is Queue => {
	return !!(item as Queue).sendBatch
}

const isDurableObject = (item: unknown): item is DurableObjectNamespace => {
	return !!(item as DurableObjectNamespace).idFromName
}

const instrumentEnv = (env: Record<string, unknown>, config: BindingsConfig): Record<string, unknown> => {
	return new Proxy(env, {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item)) {
				if (typeof config.kv !== 'boolean' && typeof prop === 'string') {
					return instrumentKV(item, prop, config.kv)
				}
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop), {})
			} else if (isDurableObject(item)) {
				return instrumentDurableObject(item, String(prop), {})
			}
			return item
		},
	})
}

export { instrumentEnv }
