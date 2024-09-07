export const stateMachine = () => {
    const stateFunc = state();
    return {
        state: stateFunc,
    };
};
const state = () => {
    return (_s) => {
        const transitionFunc = transition();
        const stateFunc = state();
        const builder = {
            state: stateFunc,
            transition: transitionFunc,
        };
        return builder;
    };
};
const transition = () => {
    return (_curState, _next) => {
        const transitionFunction = transition();
        const actionFunc = action();
        return {
            transition: transitionFunction,
            action: actionFunc,
        };
    };
};
const action = () => {
    return (_actionName) => {
        const actionFunc = action();
        const actionHandlerFunc = actionHandler({ handlers: {} });
        return {
            action: actionFunc,
            actionHandler: actionHandlerFunc,
        };
    };
};
const actionHandler = (definition) => {
    return (state, action, handler) => {
        const untypedState = state;
        const untypedAction = action;
        const newDefinition = {
            ...definition,
            handlers: {
                ...definition.handlers,
                [untypedState]: {
                    ...(definition.handlers[untypedState] ? definition.handlers[untypedState] : {}),
                    [untypedAction]: handler,
                },
            },
        };
        const doneFunc = done(newDefinition);
        const actionHandlerFunc = actionHandler(newDefinition);
        return {
            actionHandler: actionHandlerFunc,
            done: doneFunc,
        };
    };
};
const done = (definition) => {
    const doneFunc = (_) => {
        const nextStateFunction = (curState, action) => {
            const curStateAsState = curState;
            const actionAsAction = action;
            // If no handler declared for state, state doesn't change.
            if (definition.handlers[curStateAsState.stateName] == null) {
                return curState;
            }
            // If no handler declared for action in given state, state doesn't change.
            const handler = definition.handlers[curStateAsState.stateName];
            if (handler === undefined) {
                return curState;
            }
            const nextAction = handler[actionAsAction.actionName];
            return nextAction != null ? nextAction(curState, action) : curState;
        };
        return {
            nextState: nextStateFunction,
        };
    };
    return doneFunc;
};
//# sourceMappingURL=StateMachine.js.map