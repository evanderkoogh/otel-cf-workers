import { context } from '@opentelemetry/api'
import { ResolvedTraceConfig, Trigger } from './types.js'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig
let fallbackConfig: ResolvedTraceConfig

export function setConfig(config: ResolvedTraceConfig, ctx = context.active()) {
	// I could not get the context to work properly, so I'm using a global fallback.
	// I suspect this is because I am not initialising the config properly in the WS instrumentation.
	if (!fallbackConfig) {
		fallbackConfig = config
	}
	return ctx.setValue(configSymbol, config)
}

export function getActiveConfig(): ResolvedTraceConfig {
	const config = context.active().getValue(configSymbol) as ResolvedTraceConfig
	return config || fallbackConfig
}
