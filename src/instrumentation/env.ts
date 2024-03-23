import { isProxyable, wrap } from '../wrap.js'
import { instrumentDOBinding } from './do.js'
import { instrumentKV } from './kv.js'
import { instrumentQueueSender } from './queue.js'
import { instrumentServiceBinding } from './service.js'
import { instrumentAnalyticsEngineDataset } from './analytics-engine.js'

const isKVNamespace = (item?: unknown): item is KVNamespace => {
	return !!(item as KVNamespace)?.getWithMetadata
}

const isQueue = (item?: unknown): item is Queue<unknown> => {
	return !!(item as Queue<unknown>)?.sendBatch
}

const isDurableObject = (item?: unknown): item is DurableObjectNamespace => {
	return !!(item as DurableObjectNamespace)?.idFromName
}

const isServiceBinding = (item?: unknown): item is Fetcher => {
	const binding = item as Fetcher
	return !!binding.connect || !!binding.fetch || binding.queue || binding.scheduled
}

const isAnalyticsEngineDataset = (item?: unknown): item is AnalyticsEngineDataset => {
	return !!(item as AnalyticsEngineDataset)?.writeDataPoint
}

const instrumentEnv = (env: Record<string, unknown>): Record<string, unknown> => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (!isProxyable(item)) {
				return item
			}
			if (isKVNamespace(item)) {
				return instrumentKV(item, String(prop))
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isDurableObject(item)) {
				return instrumentDOBinding(item, String(prop))
			} else if (isServiceBinding(item)) {
				return instrumentServiceBinding(item, String(prop))
			} else if (isAnalyticsEngineDataset(item)) {
				return instrumentAnalyticsEngineDataset(item, String(prop))
			} else {
				return item
			}
		},
	}
	return wrap(env, envHandler)
}

export { instrumentEnv }
