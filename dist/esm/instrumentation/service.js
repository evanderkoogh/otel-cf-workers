import { passthroughGet, wrap } from '../wrap.js';
import { instrumentClientFetch } from './fetch.js';
export function instrumentServiceBinding(fetcher, envName) {
    const fetcherHandler = {
        get(target, prop) {
            if (prop === 'fetch') {
                const fetcher = Reflect.get(target, prop);
                const attrs = {
                    name: `Service Binding ${envName}`,
                };
                return instrumentClientFetch(fetcher, () => ({ includeTraceContext: true }), attrs);
            }
            else {
                return passthroughGet(target, prop);
            }
        },
    };
    return wrap(fetcher, fetcherHandler);
}
//# sourceMappingURL=service.js.map