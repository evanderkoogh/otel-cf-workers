"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentEnv = exports.isVersionMetadata = void 0;
const wrap_js_1 = require("../wrap.js");
const do_js_1 = require("./do.js");
const kv_js_1 = require("./kv.js");
const queue_js_1 = require("./queue.js");
const service_js_1 = require("./service.js");
const analytics_engine_js_1 = require("./analytics-engine.js");
const isJSRPC = (item) => {
    // @ts-expect-error The point of RPC types is to block non-existent properties, but that's the goal here
    return !!(item === null || item === void 0 ? void 0 : item['__some_property_that_will_never_exist' + Math.random()]);
};
const isKVNamespace = (item) => {
    return !isJSRPC(item) && !!(item === null || item === void 0 ? void 0 : item.getWithMetadata);
};
const isQueue = (item) => {
    return !isJSRPC(item) && !!(item === null || item === void 0 ? void 0 : item.sendBatch);
};
const isDurableObject = (item) => {
    return !isJSRPC(item) && !!(item === null || item === void 0 ? void 0 : item.idFromName);
};
const isVersionMetadata = (item) => {
    return (!isJSRPC(item) &&
        typeof (item === null || item === void 0 ? void 0 : item.id) === 'string' &&
        typeof (item === null || item === void 0 ? void 0 : item.tag) === 'string');
};
exports.isVersionMetadata = isVersionMetadata;
const isAnalyticsEngineDataset = (item) => {
    return !isJSRPC(item) && !!(item === null || item === void 0 ? void 0 : item.writeDataPoint);
};
const instrumentEnv = (env) => {
    const envHandler = {
        get: (target, prop, receiver) => {
            const item = Reflect.get(target, prop, receiver);
            if (!(0, wrap_js_1.isProxyable)(item)) {
                return item;
            }
            if (isJSRPC(item)) {
                return (0, service_js_1.instrumentServiceBinding)(item, String(prop));
            }
            else if (isKVNamespace(item)) {
                return (0, kv_js_1.instrumentKV)(item, String(prop));
            }
            else if (isQueue(item)) {
                return (0, queue_js_1.instrumentQueueSender)(item, String(prop));
            }
            else if (isDurableObject(item)) {
                return (0, do_js_1.instrumentDOBinding)(item, String(prop));
            }
            else if ((0, exports.isVersionMetadata)(item)) {
                // we do not need to log accesses to the metadata
                return item;
            }
            else if (isAnalyticsEngineDataset(item)) {
                return (0, analytics_engine_js_1.instrumentAnalyticsEngineDataset)(item, String(prop));
            }
            else {
                return item;
            }
        },
    };
    return (0, wrap_js_1.wrap)(env, envHandler);
};
exports.instrumentEnv = instrumentEnv;
//# sourceMappingURL=env.js.map