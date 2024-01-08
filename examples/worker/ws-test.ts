import WebSocket from 'ws'

const ws = new WebSocket('ws://0.0.0.0:8787/ws')

ws.on('error', console.error)

ws.on('open', function open() {
	ws.send('CLICK')
})

ws.on('message', function message(data) {
	console.log('received: %s', data)
})
