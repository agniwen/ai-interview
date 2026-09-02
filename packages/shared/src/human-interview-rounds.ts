const DIGITS = "零一二三四五六七八九";

export function formatBusinessInterviewLabel(number: number): string {
  let numeral = String(number);
  if (number > 0 && number < 10) {
    numeral = DIGITS[number] ?? numeral;
  } else if (number >= 10 && number < 100) {
    const tens = Math.floor(number / 10);
    numeral = `${tens === 1 ? "" : DIGITS[tens]}十${number % 10 ? DIGITS[number % 10] : ""}`;
  }
  return `业务${numeral}面`;
}

export function parseBusinessInterviewNumber(label: string): number | null {
  for (let number = 1; number < 100; number += 1) {
    if (formatBusinessInterviewLabel(number) === label) {
      return number;
    }
  }
  const digits = /^业务([1-9]\d*)面$/.exec(label);
  return digits ? Number(digits[1]) : null;
}

export function getNextBusinessInterviewLabel(
  rounds: readonly { label: string; status: string; outcome: string | null }[],
): string {
  const last = rounds.at(-1);
  if (last?.status === "cancelled") {
    return last.label;
  }
  return formatBusinessInterviewLabel(
    rounds.filter(
      (round) =>
        round.status === "completed" && round.outcome === "pass" && round.label !== "CEO面试",
    ).length + 1,
  );
}
