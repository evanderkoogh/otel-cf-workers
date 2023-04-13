import { loadGlobalsConfig, PartialTraceConfig } from './config'
import { instrumentFetchHandler } from './instrumentation/fetch'
import { instrumentGlobalCache, instrumentGlobalFetch } from './instrumentation/globals'
import { instrumentQueueHandler } from './instrumentation/queue'
import { instrumentDO as instrDO } from './instrumentation/do'

type DOClass = { new (state: DurableObjectState, env: Record<string, any>): DurableObject }

const instrument = <E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: PartialTraceConfig
): ExportedHandler<E, Q, C> => {
	const globalsConfig = loadGlobalsConfig(config)
	instrumentGlobalCache(globalsConfig.caches)
	instrumentGlobalFetch(globalsConfig.fetch)

	if (handler.fetch) {
		handler.fetch = instrumentFetchHandler(handler.fetch, config)
	}
	if (handler.queue) {
		handler.queue = instrumentQueueHandler(handler.queue, config)
	}
	return handler
}

const instrumentDO = (doClass: DOClass, config: PartialTraceConfig) => {
	const globalsConfig = loadGlobalsConfig(config)
	instrumentGlobalCache(globalsConfig.caches)
	instrumentGlobalFetch(globalsConfig.fetch)
	return instrDO(doClass, config)
}

export { instrument, instrumentDO }
