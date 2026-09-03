import type { CSSProperties } from "react";

interface ThreadLayoutStyle extends CSSProperties {
  "--thread-max-width": string;
}

export const emptyThreadStyle: ThreadLayoutStyle = {
  "--thread-max-width": "48rem",
};
