import { WorkerTraceConfig } from './config'
import { instrumentGlobalFetch, proxyFetchHandler } from './instrumentation/fetch'
import { proxyQueueHandler } from './instrumentation/queue'

const instrument = <E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: WorkerTraceConfig
): ExportedHandler<E, Q, C> => {
	instrumentGlobalFetch()
	if (handler.fetch) {
		handler.fetch = proxyFetchHandler(handler.fetch, config)
	}
	if (handler.queue) {
		handler.queue = proxyQueueHandler(handler.queue, config)
	}
	return handler
}

export { instrument }
