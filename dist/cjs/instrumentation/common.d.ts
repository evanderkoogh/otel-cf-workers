type ContextAndTracker = {
    ctx: ExecutionContext;
    tracker: PromiseTracker;
};
export declare class PromiseTracker {
    _outstandingPromises: Promise<unknown>[];
    get outstandingPromiseCount(): number;
    track(promise: Promise<unknown>): void;
    wait(): Promise<void>;
}
export declare function proxyExecutionContext(context: ExecutionContext): ContextAndTracker;
export declare function exportSpans(tracker?: PromiseTracker): Promise<void>;
/** Overloads extracts up to 4 overloads for the given function. */
export type Overloads<T> = T extends {
    (...args: infer P1): infer R1;
    (...args: infer P2): infer R2;
    (...args: infer P3): infer R3;
    (...args: infer P4): infer R4;
} ? ((...args: P1) => R1) | ((...args: P2) => R2) | ((...args: P3) => R3) | ((...args: P4) => R4) : never;
export {};
//# sourceMappingURL=common.d.ts.map