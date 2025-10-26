# Package Upgrade Plan

This document outlines the major package updates that require careful migration and testing.

## Current Status

Last updated: 2025-10-26

### Recently Completed ✅
- ✅ express-rate-limit: 7.5.1 → 8.1.0 (tested, no breaking changes)
- ✅ uuid: 11.1.0 → 13.0.0 (tested, no breaking changes)
- ✅ swagger-jsdoc: 7.0.0-rc.6 → 6.2.8 (moved from RC to stable)
- ✅ @types/express: 5.0.3 → 5.0.4
- ✅ @types/node: 24.8.1 → 24.9.1

### Pending Major Updates 🔴

These require migration work and thorough testing due to breaking changes:

## 1. Express 5 (Current: 4.21.2 → Latest: 5.1.0)

**Priority**: HIGH
**Estimated Effort**: 2-3 hours
**Risk**: MEDIUM

### Breaking Changes
- Middleware signature changes
- Error handling middleware changes
- Router behavior changes
- Body parser now built-in (no need for body-parser package)
- Changed behavior for `res.send()` with different types

### Migration Steps
1. Review [Express 5 Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
2. Update all middleware to use new signatures
3. Update error handling middleware
4. Test all routes thoroughly
5. Update integration tests

### Testing Checklist
- [ ] All routes respond correctly
- [ ] Error handling works as expected
- [ ] Middleware chains work correctly
- [ ] WebSocket integration still works
- [ ] All 574 tests pass

---

## 2. Jest 30 (Current: 29.7.0 → Latest: 30.2.0)

**Priority**: MEDIUM
**Estimated Effort**: 1-2 hours
**Risk**: LOW-MEDIUM

### Breaking Changes
- Node.js 18+ required (already satisfied)
- Some matcher API changes
- Configuration schema updates
- Timer mock behavior changes

### Migration Steps
1. Review [Jest 30 Changelog](https://github.com/jestjs/jest/blob/main/CHANGELOG.md)
2. Update jest.config.js if needed
3. Update @types/jest: 29.5.14 → 30.0.0
4. Run all tests and fix any failures
5. Update test documentation

### Testing Checklist
- [ ] All 574 tests pass
- [ ] Coverage reports generate correctly
- [ ] Mock behavior is consistent
- [ ] Snapshot tests work

---

## 3. bcrypt 6 (Current: 5.1.1 → Latest: 6.0.0)

**Priority**: MEDIUM
**Estimated Effort**: 30 minutes
**Risk**: LOW

### Breaking Changes
- Minimum Node.js version requirement
- Potential native module compilation changes
- API changes (minor)

### Migration Steps
1. Review [bcrypt changelog](https://github.com/kelektiv/node.bcrypt.js/releases)
2. Update bcrypt and @types/bcrypt together
3. Rebuild native modules: `npm rebuild bcrypt`
4. Test authentication flows
5. Verify password hashing/comparison works

### Testing Checklist
- [ ] User authentication works
- [ ] Password hashing works
- [ ] Password comparison works
- [ ] All auth-related tests pass

---

## 4. Joi 18 (Current: 17.13.3 → Latest: 18.0.1)

**Priority**: LOW
**Estimated Effort**: 1 hour
**Risk**: LOW

### Breaking Changes
- Validation schema changes
- Error message format changes
- Some validation rule updates

### Migration Steps
1. Review [Joi 18 changelog](https://github.com/hapijs/joi/releases)
2. Update validation schemas
3. Update error handling for new error formats
4. Test all validation endpoints
5. Update validation tests

### Testing Checklist
- [ ] All validation schemas work
- [ ] Error messages are correct
- [ ] API validation tests pass
- [ ] Request validation works correctly

---

## Recommended Upgrade Order

1. **Phase 1** (Completed) ✅
   - express-rate-limit, uuid, swagger-jsdoc
   - @types packages (patch versions)

2. **Phase 2** (Next - Q1 2026)
   - Jest 30 + @types/jest (lowest risk, easiest migration)
   - bcrypt 6 + @types/bcrypt (test authentication thoroughly)

3. **Phase 3** (Q1 2026)
   - Joi 18 (test validation endpoints)

4. **Phase 4** (Q2 2026)
   - Express 5 (most complex, save for last when team has time)

---

## Testing Strategy

For each major update:

1. **Create a feature branch** for the update
2. **Update the package** and run tests
3. **Fix any breaking changes** one at a time
4. **Run full test suite** - ensure 100% pass rate
5. **Manual testing** of affected features
6. **Review code coverage** - maintain 53%+
7. **Merge to main** only after all tests pass

---

## Rollback Plan

If any update causes issues:

1. Revert the commit: `git revert <commit-hash>`
2. Run `npm install` to restore previous versions
3. Document the issue in this file
4. Schedule time to investigate and retry

---

## Notes

- All updates require Node.js 18+ (currently satisfied)
- Keep test coverage above 53%
- Always update @types packages alongside their counterparts
- Test in development environment before production

---

## Questions or Issues?

Contact the development team before proceeding with major updates.
