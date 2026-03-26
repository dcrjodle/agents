# .NET / Ivy Framework Review Checklist

## C# Conventions
- [ ] Uses `async`/`await` for async operations, `ValueTask` for hot paths
- [ ] PascalCase for classes/methods/properties, _camelCase for private fields
- [ ] XML documentation on all public APIs
- [ ] No `string` concatenation — use interpolation or StringBuilder
- [ ] IDisposable resources properly disposed

## Ivy Framework
- [ ] Widgets used correctly per Ivy documentation
- [ ] Proper use of Ivy components and layouts
- [ ] Color references use CSS variables, not hardcoded values
- [ ] Follows Ivy naming conventions

## Security
- [ ] No injection vulnerabilities (SQL, command)
- [ ] Input validation at system boundaries
- [ ] No hardcoded secrets or credentials
- [ ] Proper authentication/authorization checks

## Quality
- [ ] Code is readable and self-documenting
- [ ] Functions are focused and composable
- [ ] No unnecessary complexity or over-engineering
- [ ] Consistent naming conventions
- [ ] No dead code or commented-out blocks

## Testing
- [ ] xUnit tests with [Fact] and [Theory] attributes
- [ ] Arrange/Act/Assert pattern
- [ ] Edge cases covered
