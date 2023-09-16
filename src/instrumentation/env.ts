import { wrap } from '../wrap.js'
import { instrumentDOBinding } from './do.js'
import { instrumentClientFetch } from './fetch.js'
import { instrumentKV } from './kv.js'
import { instrumentQueueSender } from './queue.js'
import { instrumentFetcher } from './service.js'

const isKVNamespace = (item?: unknown): item is KVNamespace => {
	return !!(item as KVNamespace)?.getWithMetadata
}

const isQueue = (item?: unknown): item is Queue<unknown> => {
	return !!(item as Queue<unknown>)?.sendBatch
}

const isDurableObject = (item?: unknown): item is DurableObjectNamespace => {
	return !!(item as DurableObjectNamespace)?.idFromName
}

const isFetcher = (item?: unknown): item is Fetcher => {
	return item instanceof Fetcher
}

const instrumentEnv = (env: Record<string, unknown>): Record<string, unknown> => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (isKVNamespace(item)) {
				return instrumentKV(item, String(prop))
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isDurableObject(item)) {
				return instrumentDOBinding(item, String(prop))
			} else if (isFetcher(item)) {
				return instrumentFetcher(item, String(prop))
			} else {
				return item
			}
		},
	}
	return wrap(env, envHandler)
}

export { instrumentEnv }
