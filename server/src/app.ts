/**
 * @module SrcApp
 * Re-exports the Express application instance from ../app for consistent module resolution.
 */

import app from "../app";

export default app;
export { app };

// CommonJS compatibility
module.exports = app;
module.exports.default = app;
module.exports.app = app;
