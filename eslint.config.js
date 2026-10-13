// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "sim/out/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Simulation results must be reproducible: forbid ambient randomness and wall-clock time.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng from sim/rng.ts." },
        { object: "Date", property: "now", message: "Simulation time is the group-day counter." },
      ],
    },
  },
);
