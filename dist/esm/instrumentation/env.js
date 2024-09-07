import { isProxyable, wrap } from '../wrap.js';
import { instrumentDOBinding } from './do.js';
import { instrumentKV } from './kv.js';
import { instrumentQueueSender } from './queue.js';
import { instrumentServiceBinding } from './service.js';
import { instrumentAnalyticsEngineDataset } from './analytics-engine.js';
const isJSRPC = (item) => {
    // @ts-expect-error The point of RPC types is to block non-existent properties, but that's the goal here
    return !!item?.['__some_property_that_will_never_exist' + Math.random()];
};
const isKVNamespace = (item) => {
    return !isJSRPC(item) && !!item?.getWithMetadata;
};
const isQueue = (item) => {
    return !isJSRPC(item) && !!item?.sendBatch;
};
const isDurableObject = (item) => {
    return !isJSRPC(item) && !!item?.idFromName;
};
export const isVersionMetadata = (item) => {
    return (!isJSRPC(item) &&
        typeof item?.id === 'string' &&
        typeof item?.tag === 'string');
};
const isAnalyticsEngineDataset = (item) => {
    return !isJSRPC(item) && !!item?.writeDataPoint;
};
const instrumentEnv = (env) => {
    const envHandler = {
        get: (target, prop, receiver) => {
            const item = Reflect.get(target, prop, receiver);
            if (!isProxyable(item)) {
                return item;
            }
            if (isJSRPC(item)) {
                return instrumentServiceBinding(item, String(prop));
            }
            else if (isKVNamespace(item)) {
                return instrumentKV(item, String(prop));
            }
            else if (isQueue(item)) {
                return instrumentQueueSender(item, String(prop));
            }
            else if (isDurableObject(item)) {
                return instrumentDOBinding(item, String(prop));
            }
            else if (isVersionMetadata(item)) {
                // we do not need to log accesses to the metadata
                return item;
            }
            else if (isAnalyticsEngineDataset(item)) {
                return instrumentAnalyticsEngineDataset(item, String(prop));
            }
            else {
                return item;
            }
        },
    };
    return wrap(env, envHandler);
};
export { instrumentEnv };
//# sourceMappingURL=env.js.map