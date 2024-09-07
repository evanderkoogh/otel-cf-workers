import { Initialiser } from '../config.js';
type QueueHandler = ExportedHandlerQueueHandler<unknown, unknown>;
export type QueueHandlerArgs = Parameters<QueueHandler>;
export declare function executeQueueHandler(queueFn: QueueHandler, [batch, env, ctx]: QueueHandlerArgs): Promise<void>;
export declare function createQueueHandler(queueFn: QueueHandler, initialiser: Initialiser): QueueHandler;
export declare function instrumentQueueSender(queue: Queue<unknown>, name: string): Queue<unknown>;
export {};
//# sourceMappingURL=queue.d.ts.map