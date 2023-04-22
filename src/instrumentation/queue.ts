import { trace, SpanOptions, SpanKind, Attributes, Exception } from '@opentelemetry/api'
import { Initialiser } from '../config'
import { WorkerTracer } from '../tracer'
import { wrap } from './common'
import { instrumentEnv } from './env'

type QueueConfig = {}

type QueueHandler = ExportedHandlerQueueHandler<unknown, unknown>
export type QueueHandlerArgs = Parameters<QueueHandler>

class MessageStatusCount {
	succeeded = 0
	failed = 0
	readonly total: number
	constructor(total: number) {
		this.total = total
	}

	ack() {
		this.succeeded = this.succeeded + 1
	}

	ackRemaining() {
		this.succeeded = this.total - this.failed
	}

	retry() {
		this.failed = this.failed + 1
	}

	retryRemaining() {
		this.failed = this.total - this.succeeded
	}

	toAttributes(): Attributes {
		return {
			'queue.messages_count': this.total,
			'queue.messages_success': this.succeeded,
			'queue.messages_failed': this.failed,
			'queue.batch_success': this.succeeded === this.total,
		}
	}
}

const addEvent = (name: string, msg?: Message) => {
	const attrs: Attributes = {}
	if (msg) {
		attrs['queue.message_id'] = msg.id
		attrs['queue.message_timestamp'] = msg.timestamp.toISOString()
	}
	trace.getActiveSpan()?.addEvent(name, attrs)
}

const proxyQueueMessage = <Q>(msg: Message<Q>, count: MessageStatusCount): Message<Q> => {
	const msgHandler: ProxyHandler<Message<Q>> = {
		get: (target, prop) => {
			if (prop === 'ack') {
				const ackFn = Reflect.get(target, prop)
				return new Proxy(ackFn, {
					apply: (fnTarget) => {
						addEvent('messageAck', msg)
						count.ack()

						//TODO: handle errors
						Reflect.apply(fnTarget, msg, [])
					},
				})
			} else if (prop === 'retry') {
				const retryFn = Reflect.get(target, prop)
				return new Proxy(retryFn, {
					apply: (fnTarget) => {
						addEvent('messageRetry', msg)
						count.retry()
						//TODO: handle errors
						const result = Reflect.apply(fnTarget, msg, [])
						return result
					},
				})
			} else {
				return Reflect.get(target, prop, msg)
			}
		},
	}
	return wrap(msg, msgHandler)
}

const proxyMessageBatch = <E, Q>(batch: MessageBatch, count: MessageStatusCount) => {
	const batchHandler: ProxyHandler<MessageBatch> = {
		get: (target, prop) => {
			if (prop === 'messages') {
				const messages = Reflect.get(target, prop)
				const messagesHandler: ProxyHandler<MessageBatch['messages']> = {
					get: (target, prop) => {
						if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
							const message = Reflect.get(target, prop)
							return proxyQueueMessage(message, count)
						} else {
							return Reflect.get(target, prop)
						}
					},
				}
				return wrap(messages, messagesHandler)
			} else if (prop === 'ackAll') {
				const ackFn = Reflect.get(target, prop)
				return new Proxy(ackFn, {
					apply: (fnTarget) => {
						addEvent('ackAll')
						count.ackRemaining()
						//TODO: handle errors
						Reflect.apply(fnTarget, batch, [])
					},
				})
			} else if (prop === 'retryAll') {
				const retryFn = Reflect.get(target, prop)
				return new Proxy(retryFn, {
					apply: (fnTarget) => {
						addEvent('retryAll')
						count.retryRemaining()
						//TODO: handle errors
						Reflect.apply(fnTarget, batch, [])
					},
				})
			}

			return Reflect.get(target, prop)
		},
	}
	return wrap(batch, batchHandler)
}

export function executeQueueHandler(queueFn: QueueHandler, [batch, env, ctx]: QueueHandlerArgs): Promise<void> {
	const count = new MessageStatusCount(batch.messages.length)
	batch = proxyMessageBatch(batch, count)
	const tracer = trace.getTracer('queueHandler')
	const options: SpanOptions = { kind: SpanKind.CONSUMER }
	const promise = tracer.startActiveSpan(`queueHandler:${batch.queue}`, options, async (span) => {
		span.setAttribute('queue.name', batch.queue)
		try {
			const result = queueFn(batch, env, ctx)
			await span.setAttribute('queue.implicitly_acked', count.total - count.succeeded - count.failed)
			count.ackRemaining()
			span.setAttributes(count.toAttributes())
			span.end()
			return result
		} catch (error) {
			span.recordException(error as Exception)
			span.setAttribute('queue.implicitly_retried', count.total - count.succeeded - count.failed)
			count.retryRemaining()
			span.end()
			throw error
		}
	})
	return promise
}

// const instrumentQueueHandler = <E, Q>(queue: QueueHandler, initialiser: Initialiser): QueueHandler => {
// 	const queueHandler: ProxyHandler<QueueHandler> = {
// 		apply: (target, thisArg, argArray) => {
// 			const batch: MessageBatch = argArray[0]
// 			const env = argArray[1] as Record<string, unknown>
// 			const config = initialiser(env, batch)
// 			argArray[1] = instrumentEnv(env)
// 			const count = new MessageStatusCount(batch.messages.length)
// 			argArray[0] = proxyMessageBatch(batch, count)
// 			const tracer = trace.getTracer('queueHandler')
// 			const options: SpanOptions = { kind: SpanKind.CONSUMER }
// 			const promise = tracer.startActiveSpan(`queueHandler:${batch.queue}`, options, async (span) => {
// 				span.setAttribute('queue.name', batch.queue)
// 				try {
// 					const result = await Reflect.apply(target, thisArg, argArray)
// 					span.setAttribute('queue.implicitly_acked', count.total - count.succeeded - count.failed)
// 					count.ackRemaining()
// 					span.setAttributes(count.toAttributes())

// 					return result
// 				} catch (error) {
// 					span.recordException(error as Exception)
// 					span.setAttribute('queue.implicitly_retried', count.total - count.succeeded - count.failed)
// 					count.retryRemaining()
// 				} finally {
// 					span.end()
// 					const tracer = trace.getTracer('export')
// 					if (tracer instanceof WorkerTracer) {
// 						await tracer.spanProcessor.forceFlush()
// 					}
// 				}
// 			})
// 			return promise
// 		},
// 	}
// 	return wrap(queue, queueHandler)
// }

export function instrumentQueueSender(queue: Queue, name: string) {
	const tracer = trace.getTracer('queueSender')
	const queueHandler: ProxyHandler<Queue> = {
		get: (target, prop) => {
			if (prop === 'send') {
				const sendFn = Reflect.get(target, prop)
				return new Proxy(sendFn, {
					apply: (target, _thisArg, argArray) => {
						return tracer.startActiveSpan(`queueSend: ${name}`, async (span) => {
							span.setAttribute('queue.operation', 'send')
							await Reflect.apply(target, queue, argArray)
							span.end()
						})
					},
				})
			} else if (prop === 'sendBatch') {
				const sendFn = Reflect.get(target, prop)
				return new Proxy(sendFn, {
					apply: (target, _thisArg, argArray) => {
						return tracer.startActiveSpan(`queueSendBatch: ${name}`, async (span) => {
							span.setAttribute('queue.operation', 'sendBatch')
							await Reflect.apply(target, queue, argArray)
							span.end()
						})
					},
				})
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	return wrap(queue, queueHandler)
}
