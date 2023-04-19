import { loadGlobalsConfig, PartialTraceConfig, Initialiser, loadConfig, init } from './config'
import { instrumentFetchHandler } from './instrumentation/fetch'
import { instrumentGlobalCache, instrumentGlobalFetch } from './instrumentation/globals'
import { instrumentQueueHandler } from './instrumentation/queue'
import { DOClass, instrumentDO as instrDO } from './instrumentation/do'
import { context } from '@opentelemetry/api'

const instrument = <E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: PartialTraceConfig
): ExportedHandler<E, Q, C> => {
	const globalsConfig = loadGlobalsConfig(config)
	instrumentGlobalCache(globalsConfig.caches)
	instrumentGlobalFetch(globalsConfig.fetch)

	const initialiser: Initialiser = (env, _trigger) => {
		const conf = loadConfig(config, env)
		init(conf)
		return conf
	}

	if (handler.fetch) {
		handler.fetch = instrumentFetchHandler(handler.fetch, initialiser)
	}
	if (handler.queue) {
		handler.queue = instrumentQueueHandler(handler.queue, initialiser)
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
