import { trace } from '@opentelemetry/api';
import { WorkerTracer } from '../tracer.js';
import { passthroughGet, wrap } from '../wrap.js';
export class PromiseTracker {
    _outstandingPromises = [];
    get outstandingPromiseCount() {
        return this._outstandingPromises.length;
    }
    track(promise) {
        this._outstandingPromises.push(promise);
    }
    async wait() {
        await allSettledMutable(this._outstandingPromises);
    }
}
function createWaitUntil(fn, context, tracker) {
    const handler = {
        apply(target, _thisArg, argArray) {
            tracker.track(argArray[0]);
            return Reflect.apply(target, context, argArray);
        },
    };
    return wrap(fn, handler);
}
export function proxyExecutionContext(context) {
    const tracker = new PromiseTracker();
    const ctx = new Proxy(context, {
        get(target, prop) {
            if (prop === 'waitUntil') {
                const fn = Reflect.get(target, prop);
                return createWaitUntil(fn, context, tracker);
            }
            else {
                return passthroughGet(target, prop);
            }
        },
    });
    return { ctx, tracker };
}
export async function exportSpans(tracker) {
    const tracer = trace.getTracer('export');
    if (tracer instanceof WorkerTracer) {
        await scheduler.wait(1);
        if (tracker) {
            await tracker.wait();
        }
        const promises = tracer.spanProcessors.map(async (spanProcessor) => {
            await spanProcessor.forceFlush();
        });
        await Promise.allSettled(promises);
    }
    else {
        console.error('The global tracer is not of type WorkerTracer and can not export spans');
    }
}
/** Like `Promise.allSettled`, but handles modifications to the promises array */
async function allSettledMutable(promises) {
    let values;
    // when the length of the array changes, there has been a nested call to waitUntil
    // and we should await the promises again
    do {
        values = await Promise.allSettled(promises);
    } while (values.length !== promises.length);
    return values;
}
//# sourceMappingURL=common.js.map