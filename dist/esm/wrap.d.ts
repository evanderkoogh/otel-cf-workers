declare const unwrapSymbol: unique symbol;
type Wrapped<T> = {
    [unwrapSymbol]: T;
} & T;
export declare function isWrapped<T>(item: T): item is Wrapped<T>;
export declare function isProxyable(item: any): boolean;
export declare function wrap<T extends object>(item: T, handler: ProxyHandler<T>, autoPassthrough?: boolean): T;
export declare function unwrap<T extends object>(item: T): T;
export declare function passthroughGet(target: any, prop: string | symbol, thisArg?: any): any;
export {};
//# sourceMappingURL=wrap.d.ts.map