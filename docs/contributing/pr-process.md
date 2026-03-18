# Pull Request Process

How to submit and review changes.

> **Navigation:** [Documentation](../README.md) > [Contributing](README.md) > [PR Process](pr-process.md)

---

## Before You Start

### Check Existing Issues

1. Search [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues)
2. Check if someone is already working on it
3. If not, comment on the issue that you're starting work

### Discuss Major Changes

For significant changes:
1. Open a discussion in [GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions)
2. Get feedback before implementing
3. Document the agreed approach

---

## Creating a PR

### 1. Fork and Branch

```bash
# Fork the repository (using GitHub UI)

# Clone your fork
git clone https://github.com/YOUR-USERNAME/SearchBox.git
cd SearchBox

# Create feature branch
git checkout -b feature/my-feature
```

**Branch naming:**
- `feature/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation
- `refactor/` — Code refactoring
- `test/` — Test additions

### 2. Make Changes

Follow [Code Style](code-style.md):

```bash
# Format code
uv run black .

# Lint
uv run ruff check . --fix

# Type check
uv run mypy .

# Run tests
uv run pytest
```

### 3. Commit

Write clear commit messages:

```
feat: add document preview feature

- Add PDF preview component
- Add DOCX preview support
- Update UI for preview modal

Closes #123
```

**Format:** `type: brief description`

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `style` — Formatting
- `refactor` — Code refactoring
- `test` — Tests
- `chore` — Maintenance

### 4. Push and Create PR

```bash
git push origin feature/my-feature
```

Then on GitHub:
1. Click "Create Pull Request"
2. Fill in the PR template

---

## PR Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] Documentation update

## Testing

- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Coverage maintained or improved

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tests added and passing

## Screenshots (if applicable)

Add screenshots for UI changes.

## Related Issues

Closes #123
Related to #456
```

---

## Review Process

### Automated Checks

All PRs must pass:

- [ ] Linting (Ruff)
- [ ] Type checking (mypy)
- [ ] Tests (pytest)
- [ ] Coverage

### Code Review

Maintainers will review:

1. **Code quality** — Style, patterns, readability
2. **Logic** — Correctness, edge cases
3. **Testing** — Coverage, test quality
4. **Documentation** — Comments, docs updates
5. **Security** — No vulnerabilities introduced

### Addressing Feedback

```bash
# Make changes locally
git add .
git commit --amend

# Or add new commits
git add .
git commit -m "fix: address review feedback"

# Push
git push origin feature/my-feature
```

---

## Merge Requirements

Before merging:

- [ ] All CI checks pass
- [ ] At least one approval from maintainer
- [ ] No merge conflicts
- [ ] Branch is up to date with main

---

## After Merge

### Clean Up

```bash
# Switch to main
git checkout main

# Pull latest
git pull upstream main

# Delete feature branch
git branch -d feature/my-feature
git push origin --delete feature/my-feature
```

### Celebrate 🎉

Your contribution is now part of SearchBox!

---

## Review Guidelines

### For Reviewers

**Be constructive:**
- Point out issues politely
- Suggest improvements
- Explain reasoning

**Be thorough:**
- Review entire change
- Check edge cases
- Verify tests

**Be timely:**
- Review within 48 hours
- Don't block unnecessarily

**Use GitHub features:**
- Request changes for blocking issues
- Approve when ready
- Comment for non-blocking suggestions

### For Contributors

**Be patient:**
- Reviews take time
- Maintainers have other commitments

**Be responsive:**
- Address feedback promptly
- Ask for clarification if needed

**Keep it focused:**
- One feature per PR
- Keep PRs small (< 400 lines ideal)

---

## Common Issues

### CI Fails

```bash
# Run linting locally
uv run ruff check . --fix
uv run black .

# Run tests locally
uv run pytest
```

### Merge Conflicts

```bash
# Update main
git checkout main
git pull upstream main

# Rebase feature branch
git checkout feature/my-feature
git rebase main

# Fix conflicts
# Then: git add . && git rebase --continue

# Push
git push origin feature/my-feature --force
```

### Large PR

If your PR is too large:

1. Split into smaller PRs
2. Focus on one change at a time
3. Document why it can't be split

---

## Quick Reference

| Step | Command |
|------|---------|
| Create branch | `git checkout -b feature/name` |
| Format | `uv run black .` |
| Lint | `uv run ruff check . --fix` |
| Type check | `uv run mypy .` |
| Test | `uv run pytest` |
| Commit | `git commit -m "type: message"` |
| Push | `git push origin feature/name` |

---

## Getting Help

- **Questions:** [GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions)
- **Issues:** [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues)
- **Docs:** [Documentation](../README.md)

---

**Previous:** [Testing](testing.md)