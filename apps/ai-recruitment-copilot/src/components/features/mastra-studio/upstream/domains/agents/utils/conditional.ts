export function resolveConditional<Condition, Truthy, Falsy>(
  condition: Condition,
  whenTruthy: (value: NonNullable<Condition>) => Truthy,
  whenFalsy: () => Falsy,
): Truthy | Falsy {
  if (condition) {
    return whenTruthy(condition as NonNullable<Condition>);
  }
  return whenFalsy();
}
