/**
 * State labels can be strings
 */
type StateType = IndexType;
/**
 * Action labels can be strings
 */
export type ActionNameType = IndexType;
/**
 * Represents a state and data and its corresponding data.
 */
export type State<S extends StateType, D = {}> = Readonly<D> & {
    readonly stateName: S;
};
/**
 * Give Actions to nextState() to (maybe) trigger a transition.
 */
export type Action<Name extends ActionNameType, Payload> = Readonly<Payload> & {
    readonly actionName: Name;
};
/**
 * Represents a compiler error message. Error brands prevent really clever users from naming their states as one of the error messages
 * and subverting error checking. Yet, the compiler still displays the string at the end of the failed cast indicating what the
 * issue is rather than something puzzling like could not assign to never.
 */
type ErrorBrand<T extends IndexType> = {
    [k in T]: void;
};
type IndexType = string | number;
type AssertStateInMap<StateMap, S extends StateType> = S extends MapKeys<StateMap> ? S : ErrorBrand<`'${S}' is not a state`>;
type AssertNewState<S extends StateType, States> = S extends MapKeys<States> ? ErrorBrand<`'${S}' has already been declared`> : S;
type AssertNewTransition<S extends StateType, N extends StateType, Transitions> = N extends MapLookup<Transitions, S> ? ErrorBrand<`There already exists a transition from '${S}' to '${N}'`> : N;
type AssertActionNotDefined<AN extends ActionNameType, ActionNames extends IndexType> = AN extends ActionNames ? ErrorBrand<`Action '${AN}' already declared`> : AN;
type AssertActionIsDefined<AN extends ActionNameType, ActionNames extends IndexType> = AN extends ActionNames ? AN : ErrorBrand<`'${AN}' is not an action`>;
type AssertAllNonTerminalStatesHandled<Transitions, HandledStates> = MapKeys<Transitions> extends HandledStates ? void : ErrorBrand<`No handlers declared for ${Exclude<MapKeys<Transitions>, HandledStates>}`>;
type AddToTypeMap<M, K extends string | number | symbol, V> = M | [K, V];
type MapLookup<Map, K extends string | number | symbol> = Map extends [K, infer V] ? V : never;
type MapKeys<Map> = Map extends [infer K, infer _] ? (K extends IndexType ? K : never) : never;
type MapValues<Map> = Map extends [infer _, infer V] ? V : never;
/**
 * A builder from calling stateMachine().
 */
export type StateMachineBuilder = {
    /**
     * Add a state to this state machine.
     */
    readonly state: StateFunc<never>;
};
type StateMachineFunc = () => StateMachineBuilder;
/**
 * A builder from calling .state()
 */
export type StateBuilder<StateMap> = {
    /**
     * Add a state to this state machine.
     */
    readonly state: StateFunc<StateMap>;
    readonly transition: TransitionFunc<StateMap, never>;
};
/**
 * The signature for calling the state function in the builder.
 */
type StateFunc<StateMap> = <S extends StateType, Data = {}>(state: AssertNewState<S, StateMap>) => StateBuilder<AddToTypeMap<StateMap, S, State<S, Data>>>;
/**
 * The builder returned by .transition()
 */
export type TransitionBuilder<StateMap, Transitions> = {
    /**
     * Add a transition to this state machine.
     */
    readonly transition: TransitionFunc<StateMap, Transitions>;
    readonly action: ActionFunc<StateMap, Transitions, never>;
};
/**
 * The signature of .transition()
 */
export type TransitionFunc<StateMap, Transitions> = <S extends StateType, N extends StateType>(curState: AssertStateInMap<StateMap, S>, nextState: N extends MapKeys<StateMap> ? AssertNewTransition<S, N, Transitions> : ErrorBrand<`${S} is not a declared state`>) => TransitionBuilder<StateMap, AddToTypeMap<Transitions, S, N>>;
export type ActionBuilder<StateMap, Transitions, ActionsMap> = {
    readonly action: ActionFunc<StateMap, Transitions, ActionsMap>;
    readonly actionHandler: ActionHandlerFunc<StateMap, Transitions, ActionsMap, never>;
};
export type ActionFunc<StateMap, Transitions, ActionsMap> = <AN extends ActionNameType, AP = {}>(actionName: AssertActionNotDefined<AN, MapKeys<ActionsMap>>) => ActionBuilder<StateMap, Transitions, AddToTypeMap<ActionsMap, AN, Action<AN, AP>>>;
/**
 * The builder returned by .actionHandler()
 */
export type ActionHandlersBuilder<StateMap, Transitions, ActionsMap, HandledStates> = {
    readonly actionHandler: ActionHandlerFunc<StateMap, Transitions, ActionsMap, HandledStates>;
    readonly done: DoneFunc<StateMap, ActionsMap, Transitions, HandledStates>;
};
/**
 * The Signature of .actionHandler().
 */
export type ActionHandlerFunc<StateMap, Transitions, ActionMap, HandledStates> = <S extends StateType, AN extends ActionNameType, NS extends MapValues<StateMap>>(state: AssertStateInMap<StateMap, S>, action: AssertActionIsDefined<AN, MapKeys<ActionMap>>, handler: ActionHandlerCallback<StateMap, Transitions, S, AN, NS, ActionMap>) => ActionHandlersBuilder<StateMap, Transitions, ActionMap, HandledStates | S>;
type ActionHandlerCallback<States, Transitions, CS extends StateType, AN extends ActionNameType, NS extends MapValues<States>, Actions> = (state: MapLookup<States, CS>, action: MapLookup<Actions, AN>) => NS extends State<infer N, infer ND> ? N extends MapKeys<States> ? CS extends MapKeys<Transitions> ? N extends MapLookup<Transitions, CS> ? State<N, ND> : ErrorBrand<`No transition declared between ${CS} and ${N}`> : ErrorBrand<`State ${CS} is terminal and has no transitions`> : ErrorBrand<`${N} is not a state`> : ErrorBrand<'The returned value is not a state'>;
type DoneFunc<StateMap, ActionMap, Transitions, HandledStates> = (_: AssertAllNonTerminalStatesHandled<Transitions, HandledStates>) => StateMachine<StateMap, ActionMap>;
/**
 * A state machine
 */
export type StateMachine<StateMap, ActionMap> = {
    nextState: (curState: MapValues<StateMap>, action: MapValues<ActionMap>) => MapValues<StateMap>;
};
export declare const stateMachine: StateMachineFunc;
export {};
//# sourceMappingURL=StateMachine.d.ts.map