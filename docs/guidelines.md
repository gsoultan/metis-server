### metis-server UI Guidelines (React/TS/Zustand)

The coding rules for the web app in `ui/`. They moved here from the engine
repository's [`.junie/guidelines.md`](https://github.com/gsoultan/metis/blob/main/.junie/guidelines.md)
(§4) with the web app. That file still holds the rules that apply to both
repositories: §1 *General Principles*, §5 *Low-Code & Non-Expert Friendliness*
and §6 *Roadmap Execution Governance*, and the Go rules for `cmd/` and
`internal/`.

- **Routing**: MUST use `@tanstack/react-router` for all navigation. MUST use file-based routing in the `ui/src/routes` directory. MUST use `Link` components for internal navigation. MUST use `validateSearch` for type-safe search parameters.
- **Lazy Loading**: MUST use `React.lazy` and `Suspense` for heavy components. Routing-level lazy loading is handled by TanStack Router.
- **Optimized Rendering**:
    - MUST derive state during rendering; AVOID storing derived data in state or using `useEffect` to sync it.
    - MUST use `useTransition` for non-urgent updates (e.g., filtering lists).
    - MUST parallelize independent operations using `Promise.all()`.
    - MUST use explicit boolean checks for conditional rendering (`count > 0 && ...`).
- **State Management**:
    - Global: MUST use `Zustand`.
    - Server: MUST use `@tanstack/react-query` (caching, retries, deduping).
    - Local: `useState`/`useReducer`.
- **React Design Patterns**:
    - **Custom Hooks**: Primary pattern for reusing stateful logic (e.g., `useFetchData`).
    - **Provider Pattern**: Use Context API for global data (themes, auth).
    - **Container/Presentational**: Separate logic (fetching) from UI (rendering).
    - **Compound Components**: Flexible API for related components (e.g., `<Select.Option>`).
- **Data Fetching**: MUST use `useQuery`. MUST abort in-flight requests on unmount/param changes.
- **Performance**:
    - MUST virtualize long lists; MUST use stable `key` props.
    - MUST offload CPU-bound tasks (JSON diffing, filtering) to Web Workers.
    - MUST use dynamic `import()` to code-split the application.
    - MUST use `build.rollupOptions.output.manualChunks` in `vite.config.ts` to improve chunking.
    - MUST adjust chunk size limit for warnings via `build.chunkSizeWarningLimit` in `vite.config.ts`.
- **TypeScript**: `typescript` and `typescript-for-eslint` move together, by hand. See [`ui/TYPESCRIPT.md`](../ui/TYPESCRIPT.md).
- **Verification**: MUST ensure `make ui-build` (`bun run build` in `ui/`, which ends in the bundle budget check) passes after any UI change, and `make gate` before a pull request.
- **CI/CD Readiness**: NEVER submit changes that break the UI build, or the `ui/dist` embed the `metis-server` binary is built with (`ui/embed.go`).
