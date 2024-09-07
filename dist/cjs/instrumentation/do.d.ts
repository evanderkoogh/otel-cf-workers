import { Initialiser } from '../config.js';
type FetchFn = DurableObject['fetch'];
type AlarmFn = DurableObject['alarm'];
export declare function instrumentDOBinding(ns: DurableObjectNamespace, nsName: string): DurableObjectNamespace<undefined>;
export declare function instrumentState(state: DurableObjectState): DurableObjectState;
export type DOClass = {
    new (state: DurableObjectState, env: any): DurableObject;
};
export declare function executeDOFetch(fetchFn: FetchFn, request: Request, id: DurableObjectId): Promise<Response>;
export declare function executeDOAlarm(alarmFn: NonNullable<AlarmFn>, id: DurableObjectId): Promise<void>;
export declare function instrumentDOClass(doClass: DOClass, initialiser: Initialiser): DOClass;
export {};
//# sourceMappingURL=do.d.ts.map