import { wrap } from '../wrap'
import { SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { setConfig } from '../config.js'
import { ResolvedTraceConfig } from '../types'
const tracer = trace.getTracer('websocketHandler')

export function patchWebsocketPair(config: ResolvedTraceConfig) {
	const myConfig = config
	globalThis.WebSocketPair = wrap(globalThis.WebSocketPair, {
		construct: (target, argArray) => {
			setConfig(myConfig)
			const { 0: client, 1: server } = new target()
			class Bah {
				0 = client
				1 = wrap(server, {
					get: (target, p) => {
						if (p === 'addEventListener') {
							const fn = Reflect.get(target, p).bind(target)
							return wrap(fn, {
								apply: async (target, thisArg, argArray) => {
									if (argArray[0] === 'message') {
										console.log('my config', myConfig)
										const cb = argArray[1]
										const wrappedCB = wrap(cb, {
											apply: (target, thisArg, argArray) => {
												console.log('cmoooooon')
												// await Reflect.apply(target, thisArg, argArray)
												const options: SpanOptions = { kind: SpanKind.CLIENT }
												return tracer.startActiveSpan('ws', options, async (span) => {
													console.log('add message attributes', argArray)
													try {
														await Reflect.apply(target, thisArg, argArray)
														span.end()
														console.log('end trace')
													} catch (e) {
														console.log(e)
														span.end()
														console.log('end trace')
														throw e
													}
												})
											},
										})

										Reflect.apply(target, thisArg, [argArray[0], wrappedCB])
									}
								},
							})
						}
						if (p === 'accept') {
							const accept = Reflect.get(target, p).bind(target)
							return wrap(accept, {
								apply: async (target, thisArg, argArray) => {
									const span = trace.getActiveSpan()
									span?.addEvent('accept')
									return Reflect.apply(target, thisArg, argArray)
								},
							})
						}
						if (p === 'send') {
							const send = Reflect.get(target, p).bind(target)
							return wrap(send, {
								apply: (target, thisArg, argArray) => {
									console.log('add send attributes', argArray)
									const span = trace.getActiveSpan()
									console.log(span)
									span?.addEvent('send', { data: argArray[0] })
									Reflect.apply(target, thisArg, argArray)
								},
							})
						}
						if (p === 'close') {
							return Reflect.get(target, p).bind(target)
						}
						return Reflect.get(target, p)
					},
				})
			}
			return Reflect.construct(Bah, argArray)
		},
	})
}
