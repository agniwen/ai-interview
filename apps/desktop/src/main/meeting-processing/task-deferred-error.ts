export class MeetingTaskDeferredError extends Error {
  readonly until: number;
  constructor(until: number) {
    super("等待下一批处理");
    this.name = "MeetingTaskDeferredError";
    this.until = until;
  }
}
