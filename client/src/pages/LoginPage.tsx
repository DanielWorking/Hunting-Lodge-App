/**
 * @module LoginPage
 *
 * Provides the entry point for user authentication.
 * Re-exports the optimized Login component implementing tree-shakeable imports,
 * manual chunk isolation, and lazy-loaded feedback with ErrorBoundary protection.
 */

import Login from "./Login";

export { default as Login } from "./Login";
export default Login;
