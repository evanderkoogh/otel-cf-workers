"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentServiceBinding = instrumentServiceBinding;
const wrap_js_1 = require("../wrap.js");
const fetch_js_1 = require("./fetch.js");
function instrumentServiceBinding(fetcher, envName) {
    const fetcherHandler = {
        get(target, prop) {
            if (prop === 'fetch') {
                const fetcher = Reflect.get(target, prop);
                const attrs = {
                    name: `Service Binding ${envName}`,
                };
                return (0, fetch_js_1.instrumentClientFetch)(fetcher, () => ({ includeTraceContext: true }), attrs);
            }
            else {
                return (0, wrap_js_1.passthroughGet)(target, prop);
            }
        },
    };
    return (0, wrap_js_1.wrap)(fetcher, fetcherHandler);
}
//# sourceMappingURL=service.js.map