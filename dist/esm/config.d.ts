import { ResolvedTraceConfig, Trigger } from './types.js';
export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedTraceConfig;
export declare function setConfig(config: ResolvedTraceConfig, ctx?: import("@opentelemetry/api").Context): import("@opentelemetry/api").Context;
export declare function getActiveConfig(): ResolvedTraceConfig | undefined;
//# sourceMappingURL=config.d.ts.map