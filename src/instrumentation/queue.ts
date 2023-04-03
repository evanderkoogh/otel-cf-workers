import { trace, SpanOptions, SpanKind } from '@opentelemetry/api'
import { WorkerTraceConfig, extractConfigFromEnv, init } from '../config'
import { instrumentEnv } from './env'

type QueueHandler<E, Q> = ExportedHandlerQueueHandler<E, Q>

const proxyQueueMessage = <Q>(msg: Message<Q>, _config: WorkerTraceConfig): Message<Q> => {
	return new Proxy(msg, {
		get: (target, prop) => {
			if (prop === 'ack') {
				const ackFn = Reflect.get(target, prop)
				return new Proxy(ackFn, {
					apply: (fnTarget) => {
						trace.getActiveSpan()?.addEvent('messageAck', {
							messageId: msg.id,
							messageTimestamp: msg.timestamp.getTime(),
						})
						//TODO: handle errors
						Reflect.apply(fnTarget, msg, [])
					},
				})
			} else if (prop === 'retry') {
				const retryFn = Reflect.get(target, prop)
				return new Proxy(retryFn, {
					apply: (fnTarget) => {
						const span = trace.getActiveSpan()
						span?.setAttribute('ack', false)
						//TODO: handle errors
						const result = Reflect.apply(fnTarget, msg, [])
						span?.end()
						return result
					},
				})
			} else {
				return Reflect.get(target, prop, msg)
			}
		},
	})
}

const proxyMessageBatch = <E, Q>(batch: MessageBatch, config: WorkerTraceConfig) => {
	return new Proxy(batch, {
		get: (target, prop) => {
			if (prop === 'messages') {
				const messages = Reflect.get(target, prop)
				return new Proxy(messages, {
					get: (target, prop) => {
						if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
							const message = Reflect.get(target, prop)
							return proxyQueueMessage(message, config)
						} else {
							return Reflect.get(target, prop)
						}
					},
				})
			} else {
				return Reflect.get(target, prop)
			}
		},
	})
}

const proxyQueueHandler = <E, Q>(queue: QueueHandler<E, Q>, config: WorkerTraceConfig): QueueHandler<E, Q> => {
	return new Proxy(queue, {
		apply: (target, thisArg, argArray) => {
			const env = argArray[1] as Record<string, unknown>
			extractConfigFromEnv(config, env)
			init(config)
			argArray[1] = instrumentEnv(env, config)
			const batch: MessageBatch = argArray[0]
			argArray[0] = proxyMessageBatch(batch, config)
			const tracer = trace.getTracer('queueHandler')
			const options: SpanOptions = { kind: SpanKind.CONSUMER }
			const promise = tracer.startActiveSpan(`queueHandler:${batch.queue}`, options, async (span) => {
				span.setAttribute('message.count', batch.messages.length)
				span.setAttribute('queue.name', batch.queue)
				const result = await Reflect.apply(target, thisArg, argArray)
				span.end()
				return result
			})
			return promise
		},
	})
}

export { proxyQueueHandler }
