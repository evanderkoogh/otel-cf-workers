import { WorkerTraceConfig, getActiveConfig } from '../config'
import { wrap } from './wrap'
import { instrumentDOBinding } from './do'
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
