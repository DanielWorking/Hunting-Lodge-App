import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/test/auth.test.ts"],
        environment: "node",
        globals: true,
    },
});
