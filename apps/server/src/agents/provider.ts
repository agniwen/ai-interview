export function disableAlibabaThinking<TBody extends object>(body: TBody) {
  return {
    ...body,
    enable_thinking: false,
  };
}
