import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TankApp } from "./app/TankApp";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <TankApp />
  </StrictMode>,
);
