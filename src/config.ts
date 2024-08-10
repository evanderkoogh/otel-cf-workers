import { context } from '@opentelemetry/api'
import { ResolvedTraceConfig, Trigger } from './types.js'

const configSymbol = Symbol('Otel Workers Tracing Configuration')

export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig

export function setConfig(config: ResolvedTraceConfig, ctx = context.active()) {
	return ctx.setValue(configSymbol, config)
}

export function getActiveConfig(): ResolvedTraceConfig | undefined {
	const config = context.active().getValue(configSymbol) as ResolvedTraceConfig
	return config || undefined
}
