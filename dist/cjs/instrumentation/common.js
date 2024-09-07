"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromiseTracker = void 0;
exports.proxyExecutionContext = proxyExecutionContext;
exports.exportSpans = exportSpans;
const api_1 = require("@opentelemetry/api");
const tracer_js_1 = require("../tracer.js");
const wrap_js_1 = require("../wrap.js");
class PromiseTracker {
    constructor() {
        this._outstandingPromises = [];
    }
    get outstandingPromiseCount() {
        return this._outstandingPromises.length;
    }
    track(promise) {
        this._outstandingPromises.push(promise);
    }
    wait() {
        return __awaiter(this, void 0, void 0, function* () {
            yield allSettledMutable(this._outstandingPromises);
        });
    }
}
exports.PromiseTracker = PromiseTracker;
function createWaitUntil(fn, context, tracker) {
    const handler = {
        apply(target, _thisArg, argArray) {
            tracker.track(argArray[0]);
            return Reflect.apply(target, context, argArray);
        },
    };
    return (0, wrap_js_1.wrap)(fn, handler);
}
function proxyExecutionContext(context) {
    const tracker = new PromiseTracker();
    const ctx = new Proxy(context, {
        get(target, prop) {
            if (prop === 'waitUntil') {
                const fn = Reflect.get(target, prop);
                return createWaitUntil(fn, context, tracker);
            }
            else {
                return (0, wrap_js_1.passthroughGet)(target, prop);
            }
        },
    });
    return { ctx, tracker };
}
function exportSpans(tracker) {
    return __awaiter(this, void 0, void 0, function* () {
        const tracer = api_1.trace.getTracer('export');
        if (tracer instanceof tracer_js_1.WorkerTracer) {
            yield scheduler.wait(1);
            if (tracker) {
                yield tracker.wait();
            }
            const promises = tracer.spanProcessors.map((spanProcessor) => __awaiter(this, void 0, void 0, function* () {
                yield spanProcessor.forceFlush();
            }));
            yield Promise.allSettled(promises);
        }
        else {
            console.error('The global tracer is not of type WorkerTracer and can not export spans');
        }
    });
}
/** Like `Promise.allSettled`, but handles modifications to the promises array */
function allSettledMutable(promises) {
    return __awaiter(this, void 0, void 0, function* () {
        let values;
        // when the length of the array changes, there has been a nested call to waitUntil
        // and we should await the promises again
        do {
            values = yield Promise.allSettled(promises);
        } while (values.length !== promises.length);
        return values;
    });
}
//# sourceMappingURL=common.js.map