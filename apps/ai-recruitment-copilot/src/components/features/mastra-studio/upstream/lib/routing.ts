import { flushSync } from "react-dom";

export const startViewTransition = (updatePage: () => void) => {
  if ("startViewTransition" in document) {
    document.startViewTransition(() => {
      flushSync(() => {
        updatePage();
      });
    });
  } else {
    updatePage();
  }
};
