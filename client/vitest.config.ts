import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

const packageJson = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);
const appVersion = packageJson.version || "1.0.0";

export default defineConfig({
    define: {
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    plugins: [react()],
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        fileParallelism: false,
    },
});
