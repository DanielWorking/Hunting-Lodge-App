---
name: code-comments
description: >
    Write and review professional in-code documentation comments for JavaScript and TypeScript.
    Use this skill whenever the user asks to document code, add comments, write JSDoc, review
    existing comments, add a file header, or improve code documentation quality. Trigger even
    for casual requests like "comment this function", "document my code", "add docs to this file",
    "what's wrong with my comments", or "make this more readable". If the user pastes code and
    asks anything about documentation or comments, use this skill.
---

# Code Comments Skill

Write and review professional in-code documentation for JavaScript and TypeScript.
Follow industry conventions: JSDoc for functions and methods, standardized file headers
for modules.

---

## Core Principles

- Comments explain WHY, not WHAT. Code shows what it does. Comments explain intent,
  constraints, and non-obvious decisions.
- Do not restate the code. `// increment i` above `i++` is noise.
- Write for the next engineer, not the current one.
- Be precise. Vague comments are worse than no comments.
- Keep comments up to date. Stale comments are actively harmful.

---

## JSDoc: Functions and Methods

Use JSDoc for all exported functions, public class methods, and any function whose
behavior is not immediately obvious from its signature.

### Required Tags

| Tag        | When to Use                                                        |
| ---------- | ------------------------------------------------------------------ |
| `@param`   | Every parameter. Include name, type, and what it represents.       |
| `@returns` | Any non-void return. Describe what is returned and why it matters. |
| `@throws`  | Any error that can be thrown. Describe the condition.              |

### Optional but Encouraged Tags

| Tag           | When to Use                                                           |
| ------------- | --------------------------------------------------------------------- |
| `@example`    | Complex functions, utility functions, public APIs.                    |
| `@deprecated` | Functions that should no longer be used. Include what to use instead. |
| `@see`        | Link to related functions, external docs, or spec references.         |
| `@since`      | Public APIs. The version this was introduced.                         |

### Boolean Flag Parameters

Boolean parameters change behavior. Always document what each state does, not just what the parameter is called.

BAD:

```js
* @param {boolean} forceRefresh  Whether to force refresh.
```

GOOD:

```js
* @param {boolean} forceRefresh  If true, bypasses the cache and fetches a new token.
*                                If false, returns the cached token when available.
```

If a function takes more than one boolean flag, consider whether the function is doing too much. Note this in a review.

### Format Rules

- First line: a single sentence in the imperative mood. "Fetches user data." not "This function fetches user data."
- Leave a blank line after the description before tags.
- Align `@param` descriptions vertically if there are 3 or more params (readability).
- Types go in `{curly braces}`. Use TypeScript union syntax: `{string | null}`.
- For optional params, wrap type in brackets: `@param {string} [locale]`.

### Template

```js
/**
 * <Imperative-mood summary sentence.>
 *
 * <Optional extended description. Explain non-obvious behavior,
 * edge cases, or constraints. Keep it factual.>
 *
 * @param  {Type}   paramName  Description of what this represents.
 * @param  {Type}   paramName  Description of what this represents.
 * @returns {Type}  Description of what is returned.
 * @throws  {ErrorType}  Condition under which this is thrown.
 *
 * @example
 * const result = myFunction(arg1, arg2);
 * // => expectedOutput
 */
```

### Good vs Bad Examples

BAD:

```js
// Gets the user
function getUser(id) { ... }
```

GOOD:

```js
/**
 * Fetches a user record from the database by their unique identifier.
 *
 * Returns null if no user exists with the given ID. Does not throw
 * on a missing record; only throws on a database connection failure.
 *
 * @param  {string}       id  The UUID of the user to fetch.
 * @returns {Promise<User | null>}  The user object, or null if not found.
 * @throws  {DatabaseError}  If the database connection fails.
 */
async function getUser(id) { ... }
```

---

## JSDoc: Classes

Document every class, including internal ones that are non-trivial.

### Required Tags

| Tag       | When to Use                                           |
| --------- | ----------------------------------------------------- |
| `@class`  | Always. Marks this as a class definition.             |
| `@param`  | Every constructor parameter. Same rules as functions. |
| `@throws` | If the constructor can throw.                         |

### Optional but Encouraged Tags

| Tag           | When to Use                                                |
| ------------- | ---------------------------------------------------------- |
| `@extends`    | When the class inherits from another. Name the parent.     |
| `@implements` | When the class implements an interface.                    |
| `@example`    | For public-facing or reusable classes. Show instantiation. |
| `@deprecated` | When the class is being phased out. Name the replacement.  |

### Format Rules

- First line: a single sentence describing what the class represents, not what it does.
  A class is a thing, not an action. "Represents a paginated API response." not "Handles pagination."
- Describe the responsibility boundary: what this class owns and what it delegates.
- Do not document every property in the class comment. Document properties inline
  using `/** ... */` directly above each one.

### Template

```js
/**
 * Represents <what this class models or encapsulates>.
 *
 * <Optional: describe the responsibility boundary. What does this class
 * own? What does it delegate? Any constraints on usage?>
 *
 * @class
 * @extends  {ParentClass}
 * @param  {Type}  paramName  Description.
 * @throws  {ErrorType}  Condition under which the constructor throws.
 *
 * @example
 * const instance = new MyClass(arg1, arg2);
 * instance.doSomething();
 */
```

### Property Documentation

Document public and non-obvious private properties inline:

```js
class UserSession {
    /** @type {string} The authenticated user's UUID. */
    userId;

    /** @type {Date} When this session expires. Checked on every request. */
    expiresAt;

    /** @type {boolean} True if the session was created via SSO, not password auth. */
    isSso;
}
```

### Good vs Bad Example

BAD:

```js
// User class
class User {
  constructor(id, email) { ... }
}
```

GOOD:

```js
/**
 * Represents an authenticated user within the application.
 *
 * Holds identity and session data. Does not manage persistence;
 * use UserRepository for database operations.
 *
 * @class
 * @param  {string}  id     The user's UUID from the identity provider.
 * @param  {string}  email  The user's verified email address.
 * @throws {ValidationError}  If id or email fail format validation.
 *
 * @example
 * const user = new User('abc-123', 'user@example.com');
 * console.log(user.displayName);
 */
class User {
  constructor(id, email) { ... }
}
```

---

## File / Module Headers

Every file should have a header comment at the top, above all imports.

### Required Fields

- **Module name or path**: What this file is.
- **Purpose**: One or two sentences on what this module does and why it exists.
- **Author** (optional, based on team convention): Who created it.
- **Last modified** (optional): Only include if the team does not use version control
  to track this, otherwise omit.

### Format

```js
/**
 * @module AuthService
 *
 * Handles user authentication and session management.
 * Wraps the third-party OAuth provider and normalizes tokens
 * into the internal session format.
 *
 * @see {@link https://internal-wiki/auth-spec} for the auth flow spec.
 */
```

Keep it short. One paragraph maximum. The module header is an orientation,
not a changelog.

---

## Review Mode

When the user asks to review existing comments, evaluate each comment against:

1. Does it explain WHY, not just WHAT?
2. Is every `@param` and `@returns` present and accurate?
3. Is the description still accurate given the current code?
4. Does it use correct JSDoc syntax?
5. Is there anything missing (thrown errors, edge cases, deprecation)?

Output format for a review:

- List each comment that has an issue.
- State the specific problem.
- Provide a corrected version.
- At the end, give a short summary: what was done well and what patterns to fix going forward.

---

## What NOT to Comment

- Variable declarations with self-explanatory names: `const userId = params.id`
- Obvious control flow: `// loop through users`
- Boilerplate: `// constructor`
- Code that is commented out. Delete it. Version control preserves history.

---

## TypeScript-Specific Notes

- If the function signature already has TypeScript types, you still need `@param` and
  `@returns` in JSDoc for description context. Types alone do not explain intent.
- For generics, document the type parameter: `@template T  The type of items in the collection.`
- For overloaded functions, document each overload separately.

## Constraints

- Do not modify existing function signatures, logic, or structure.
- Do not rename variables, parameters, or methods.
- Do not refactor or reformat code.
- Only add, edit, or remove comment blocks and JSDoc annotations.
- If code has a bug or smell, note it in a review comment. Do not fix it.
