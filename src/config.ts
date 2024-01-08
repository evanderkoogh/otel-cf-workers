import { context } from '@opentelemetry/api'
import { ResolvedTraceConfig, Trigger } from './types.js'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig
let bbrrrrr: ResolvedTraceConfig
export function setConfig(config: ResolvedTraceConfig, ctx = context.active()) {
	console.log('setting config')
	bbrrrrr = config
	return ctx.setValue(configSymbol, config)
}

export function getActiveConfig(): ResolvedTraceConfig {
	console.log('config where are you?')

	const config = context.active().getValue(configSymbol) as ResolvedTraceConfig
	if (!config) {
		return bbrrrrr
		throw new Error('No config found in active context')
	}
	return config
}
