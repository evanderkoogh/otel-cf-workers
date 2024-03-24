import { trace } from '@opentelemetry/api'

export interface Env {
	OTEL_TEST: KVNamespace
	Test_Otel_DO: DurableObjectNamespace
	'otel.exporter.headers.x-honeycomb-team': string
}

const handleDO = async (request: Request, env: Env): Promise<Response> => {
	const ns = env.Test_Otel_DO
	const id = ns.idFromName('testing')
	const stub = ns.get(id)
	trace.getActiveSpan()?.setAttribute('http.route', '/do')
	return await stub.fetch('https://does-not-exist.com/blah')
}

const handleRest = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
	trace.getActiveSpan()?.setAttribute('http.route', '/*')
	await fetch('https://cloudflare.com')

	const cache = await caches.open('stuff')
	const promises = [env.OTEL_TEST.get('non-existant'), cache.match(new Request('https://no-exist.com'))]
	await Promise.all(promises)

	const greeting = "G'day World"
	trace.getActiveSpan()?.setAttribute('greeting', greeting)
	ctx.waitUntil(fetch('https://workers.dev'))
	return new Response(`${greeting}!`)
}
let count = 0
async function handleSession(websocket: WebSocket, env: Env) {
	websocket.accept()

	websocket.addEventListener('message', async ({ data }) => {
		if (data === 'CLICK') {
			count += 1
			await new Promise((resolve) => setTimeout(resolve, 1000))
			websocket.send(JSON.stringify({ count, tz: new Date() }))
			await env.OTEL_TEST.get('non-existant')
			// if I add this line, the trace for message is not sent? :(
			// websocket.close()
		} else {
			// An unknown message came into the server. Send back an error message
			websocket.send(JSON.stringify({ error: 'Unknown message received', tz: new Date() }))
		}
	})

	websocket.addEventListener('close', (evt) => {
		// Handle when a client closes the WebSocket connection
	})
}

async function handleWS(request: Request, env: Env): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade')
	if (upgradeHeader !== 'websocket') {
		return new Response('Expected websocket', { status: 400 })
	}

	const [client, server] = Object.values(new WebSocketPair())
	await handleSession(server, env)

	return new Response(null, {
		status: 101,
		webSocket: client,
	})
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const pathname = new URL(request.url).pathname
		if (pathname === '/do') {
			return handleDO(request, env)
		} else if (pathname === '/ws') {
			return handleWS(request, env)
		} else if (pathname === '/error') {
			throw new Error('You asked for it!')
		} else {
			return handleRest(request, env, ctx)
		}
	},
}

export class OtelDO implements DurableObject {
	constructor(
		protected state: DurableObjectState,
		protected env: Env,
	) {
		state.blockConcurrencyWhile(async () => {
			await this.state.storage.getAlarm()
		})
	}
	async fetch(request: Request): Promise<Response> {
		await fetch('https://cloudflare.com')
		await this.state.storage.put('something', 'else')
		await this.state.storage.setAlarm(Date.now() + 1000)
		return new Response('Hello World!')
	}
	async alarm(): Promise<void> {
		console.log('ding ding!')
		await this.state.storage.get('something')
		await this.state.storage.get('something_else')
	}
}
