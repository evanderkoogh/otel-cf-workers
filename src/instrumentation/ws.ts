import { wrap } from '../wrap'
import { SpanKind, Tracer, trace } from '@opentelemetry/api'
import { setConfig } from '../config.js'
import { ResolvedTraceConfig } from '../types'

function traceWebsocket(type: string, tracer: Tracer) {
	return (messageCallback: any, scope: any, argArray: { data: string | ArrayBuffer }[] | undefined[]) => {
		const attributes = argArray[0]?.data ? { data: argArray[0].data.toString() } : {}
		// it would be nice to add links from the http request that makes the websocket connection but I can't figure out how to do that
		const currentSpan = trace.getActiveSpan()
		let links = currentSpan ? [{ context: currentSpan.spanContext() }] : []
		return tracer.startActiveSpan(
			`websocket ${type}`,
			{ kind: SpanKind.SERVER, attributes, links, root: true },
			async (span) => {
				try {
					return await Reflect.apply(messageCallback, scope, argArray)
				} catch (e) {
					span.recordException(e as Error)
					throw e
				} finally {
					span.end()
				}
			},
		)
	}
}

function wrapWSServer(server: WebSocket, config: ResolvedTraceConfig) {
	const handler: ProxyHandler<WebSocket> = {
		get: (target, p) => {
			if (p === 'addEventListener') {
				const fn = Reflect.get(target, p).bind(target)
				return wrap(fn, {
					apply: async (target, thisArg, argArray) => {
						// WHERE DO I CALL SET CONFIG - I cannot figure out how to make this work, have done a hack in config.ts to compensate
						setConfig(config)
						const cb = argArray[1]
						const wrappedCB = wrap(cb, {
							apply: traceWebsocket(argArray[0], trace.getTracer('ws')),
						})
						return Reflect.apply(target, thisArg, [argArray[0], wrappedCB, argArray[2]])
					},
				})
			}
			const method = Reflect.get(target, p)
			if (typeof method === 'function') {
				return wrap(method.bind(target), {
					apply: async (target, thisArg, argArray) => {
						const span = trace.getActiveSpan()
						span?.addEvent(p.toString())
						return Reflect.apply(target, thisArg, argArray)
					},
				})
			}
			return Reflect.get(target, p)
		},
	}
	return wrap(server, handler)
}

function instrumentWSPair(WSPair: typeof self.WebSocketPair, config: ResolvedTraceConfig) {
	const handler: ProxyHandler<typeof self.WebSocketPair> = {
		construct: (target) => {
			// call class to get access to original clients
			const { 0: client, 1: server } = new target()

			class InstrumentedWSPair {
				0 = client
				1 = wrapWSServer(server, config)
			}

			return Reflect.construct(InstrumentedWSPair, [])
		},
	}
	return wrap(self.WebSocketPair, handler)
}

export function patchWebsocketPair(config: ResolvedTraceConfig) {
	self.WebSocketPair = instrumentWSPair(self.WebSocketPair, config)
}
