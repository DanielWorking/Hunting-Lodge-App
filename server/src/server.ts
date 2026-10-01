/**
 * @module ServerEntry
 *
 * Backward- and forward-compatibility re-export for the Hunting Lodge application and HTTP server instance.
 * Allows importing from both `src/server` and root `app`/`index`.
 */

import app from "../app";
import { server } from "../index";

export { app, server };
export default app;
