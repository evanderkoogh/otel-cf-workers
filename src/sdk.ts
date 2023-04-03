import { WorkerTraceConfig } from './config'
import { instrumentGlobalFetch, instrumentFetchHandler } from './instrumentation/fetch'
import { instrumentQueueHandler } from './instrumentation/queue'

const instrument = <E, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: WorkerTraceConfig
): ExportedHandler<E, Q, C> => {
	instrumentGlobalFetch()
	if (handler.fetch) {
		handler.fetch = instrumentFetchHandler(handler.fetch, config)
	}
	if (handler.queue) {
		handler.queue = instrumentQueueHandler(handler.queue, config)
	}
	return handler
}

export { instrument }
