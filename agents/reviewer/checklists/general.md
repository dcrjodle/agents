# General Review Checklist

## Correctness
- [ ] Logic is correct and handles edge cases
- [ ] Error handling is appropriate
- [ ] No off-by-one errors or race conditions
- [ ] Boundary conditions handled

## Security
- [ ] No injection vulnerabilities (SQL, XSS, command)
- [ ] Input validation at system boundaries
- [ ] No hardcoded secrets or credentials
- [ ] Proper authentication/authorization checks

## Quality
- [ ] Code is readable and self-documenting
- [ ] Functions are focused and composable
- [ ] No unnecessary complexity or over-engineering
- [ ] Consistent naming conventions
- [ ] No dead code or commented-out blocks
- [ ] Dependencies are justified
- [ ] No comments in code (inline or block comments)

## Maintainability
- [ ] Changes are minimal and focused
- [ ] No backwards-compatibility hacks
- [ ] Consistent with existing codebase patterns
