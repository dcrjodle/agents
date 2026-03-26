# React / TypeScript Review Checklist

## TypeScript
- [ ] No `any` types — proper typing throughout
- [ ] Named exports used (no default exports)
- [ ] Interfaces/types defined for component props
- [ ] Proper type narrowing and null checks

## React
- [ ] Components have single responsibility
- [ ] Expensive calculations memoized (useMemo/useCallback)
- [ ] No prop drilling — use context or composition
- [ ] useEffect dependencies correct and complete
- [ ] Subscriptions and listeners cleaned up in useEffect return
- [ ] Error boundaries for component trees that can fail

## Styling
- [ ] Tailwind CSS classes used for styling
- [ ] Colors reference CSS variables, not hardcoded values (e.g., `text-[var(--color-primary)]`)
- [ ] No styled-components, Material-UI, or Ant Design
- [ ] Icons via Lucide `<Icon>` component, not direct imports

## Security
- [ ] No XSS vulnerabilities (dangerouslySetInnerHTML, etc.)
- [ ] User input validated and sanitized
- [ ] No hardcoded secrets or API keys
- [ ] Proper CORS and CSP headers

## Quality
- [ ] Code is readable and self-documenting
- [ ] Functions are focused and composable
- [ ] No unnecessary complexity or over-engineering
- [ ] Consistent naming conventions
- [ ] No dead code or commented-out blocks

## Testing
- [ ] Vitest tests with describe/it blocks
- [ ] render + screen queries for component tests
- [ ] User interactions tested
- [ ] Edge cases covered
