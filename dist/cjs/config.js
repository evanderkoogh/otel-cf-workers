"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConfig = setConfig;
exports.getActiveConfig = getActiveConfig;
const api_1 = require("@opentelemetry/api");
const configSymbol = Symbol('Otel Workers Tracing Configuration');
function setConfig(config, ctx = api_1.context.active()) {
    return ctx.setValue(configSymbol, config);
}
function getActiveConfig() {
    const config = api_1.context.active().getValue(configSymbol);
    return config || undefined;
}
//# sourceMappingURL=config.js.map