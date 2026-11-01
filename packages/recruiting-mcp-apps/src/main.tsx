import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RecruitingCardsApp } from "./app";
import "./styles.css";

const container = document.querySelector("#root");
if (!container) {
  throw new Error("Missing #root container for the recruiting cards view.");
}

createRoot(container).render(
  <StrictMode>
    <RecruitingCardsApp />
  </StrictMode>,
);
