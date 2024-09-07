import { context } from '@opentelemetry/api';
const configSymbol = Symbol('Otel Workers Tracing Configuration');
export function setConfig(config, ctx = context.active()) {
    return ctx.setValue(configSymbol, config);
}
export function getActiveConfig() {
    const config = context.active().getValue(configSymbol);
    return config || undefined;
}
//# sourceMappingURL=config.js.map