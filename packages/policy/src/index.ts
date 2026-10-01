// Pure policy engine: evaluate(facts) -> results of five kinds (error | policy | precondition | clarification |
// warning), the one that blocks, and how an allowed action is authorized. No I/O: callers gather the facts.
export * from "./reasons";
export * from "./send";
