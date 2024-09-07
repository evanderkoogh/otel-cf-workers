import { Attributes, Context } from '@opentelemetry/api';
import { Initialiser } from '../config.js';
import { ResolvedTraceConfig } from '../types.js';
export type IncludeTraceContextFn = (request: Request) => boolean;
export interface FetcherConfig {
    includeTraceContext?: boolean | IncludeTraceContextFn;
}
export type AcceptTraceContextFn = (request: Request) => boolean;
export interface FetchHandlerConfig {
    /**
     * Whether to enable context propagation for incoming requests to `fetch`.
     * This enables or disables distributed tracing from W3C Trace Context headers.
     * @default true
     */
    acceptTraceContext?: boolean | AcceptTraceContextFn;
}
type FetchHandler = ExportedHandlerFetchHandler;
type FetchHandlerArgs = Parameters<FetchHandler>;
export declare function gatherRequestAttributes(request: Request): Attributes;
export declare function gatherResponseAttributes(response: Response): Attributes;
export declare function gatherIncomingCfAttributes(request: Request): Attributes;
export declare function getParentContextFromHeaders(headers: Headers): Context;
export declare function waitUntilTrace(fn: () => Promise<any>): Promise<void>;
export declare function executeFetchHandler(fetchFn: FetchHandler, [request, env, ctx]: FetchHandlerArgs): Promise<Response>;
export declare function createFetchHandler(fetchFn: FetchHandler, initialiser: Initialiser): FetchHandler;
type getFetchConfig = (config: ResolvedTraceConfig) => FetcherConfig;
export declare function instrumentClientFetch(fetchFn: Fetcher['fetch'], configFn: getFetchConfig, attrs?: Attributes): Fetcher['fetch'];
export declare function instrumentGlobalFetch(): void;
export {};
//# sourceMappingURL=fetch.d.ts.map