import { Initialiser } from '../config.js';
type ScheduledHandler = ExportedHandlerScheduledHandler<unknown>;
export type ScheduledHandlerArgs = Parameters<ScheduledHandler>;
export declare function executeScheduledHandler(scheduledFn: ScheduledHandler, [controller, env, ctx]: ScheduledHandlerArgs): Promise<void>;
export declare function createScheduledHandler(scheduledFn: ScheduledHandler, initialiser: Initialiser): ScheduledHandler;
export {};
//# sourceMappingURL=scheduled.d.ts.map