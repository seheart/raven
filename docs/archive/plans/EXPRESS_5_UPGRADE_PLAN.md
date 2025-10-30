# Express 5.x Upgrade Plan

**Current Version:** Express 4.21.2
**Target Version:** Express 5.1.0
**Risk Level:** HIGH (Breaking changes)
**Priority:** MEDIUM
**Estimated Effort:** 2-4 hours testing + potential refactoring

---

## Breaking Changes to Address

### 1. Router Path Matching
**Issue:** Express 5 changed how routers match paths

**4.x Behavior:**
```javascript
app.use('/api', router); // Matches /api, /api/, /api/foo
```

**5.x Behavior:**
- More strict path matching
- Trailing slashes matter
- May affect 30 route modules

**Action Required:**
- [ ] Review all `app.use()` and `router.use()` calls
- [ ] Test all 136 endpoints
- [ ] Update path definitions if needed

### 2. Middleware Signatures
**Issue:** Some middleware signatures changed

**Affected Middleware (to check):**
- `backend/middleware/auth.js`
- `backend/middleware/validation.js`
- `backend/middleware/request-tracing.js`
- Custom error handlers in `server.js`

**Action Required:**
- [ ] Verify middleware function signatures
- [ ] Test error handling middleware
- [ ] Check async error handling

### 3. Promise Rejection Handling
**Issue:** Express 5 better handles promise rejections

**4.x:** Required manual try/catch or wrapper
**5.x:** Automatically catches promise rejections

**Action Required:**
- [ ] Review 273 try/catch blocks (may be redundant)
- [ ] Test async route handlers
- [ ] Simplify error handling where appropriate

### 4. Response Method Changes
**Issue:** Some response methods deprecated

**Deprecated:**
- `res.json(status, obj)` - Use `res.status(status).json(obj)`
- `res.send(status, body)` - Use `res.status(status).send(body)`

**Action Required:**
- [ ] Search codebase for deprecated patterns
- [ ] Update response method calls
- [ ] Run linter to catch issues

### 5. Query Parser Changes
**Issue:** Query string parsing updated

**Action Required:**
- [ ] Test all endpoints with query parameters
- [ ] Verify pagination endpoints
- [ ] Check search/filter endpoints

---

## Dependencies to Update

### Direct Dependency
```bash
npm install express@5.1.0
```

### Related Packages (Check Compatibility)
- `helmet@8.1.0` - ✅ Compatible
- `cors@2.8.5` - ⚠️ Check compatibility
- `express-rate-limit@8.1.0` - ⚠️ Check compatibility
- `compression@1.8.1` - ⚠️ Check compatibility
- `on-finished@2.4.1` - ⚠️ Check compatibility

---

## Testing Checklist

### Phase 1: Local Testing (Development)
- [ ] Install Express 5.x in development branch
- [ ] Run all 574 tests (fix failures)
- [ ] Start backend server (check for errors)
- [ ] Test each major route category:
  - [ ] Authentication routes (`/auth/*`)
  - [ ] Dashboard routes (`/api/dashboard/*`)
  - [ ] Analytics routes (`/api/analytics/*`)
  - [ ] Storage routes (`/api/storage/*`)
  - [ ] Git routes (`/api/git/*`)
  - [ ] Health routes (`/health`, `/api/health`)
  - [ ] Metrics routes (`/api/metrics/*`)
  - [ ] Projects routes (`/api/projects/*`)
  - [ ] Sessions routes (`/api/sessions/*`)
  - [ ] All 30 route modules

### Phase 2: Integration Testing
- [ ] Start frontend + backend together
- [ ] Test WebSocket connections
- [ ] Test all major user flows:
  - [ ] Dashboard loading
  - [ ] Project filtering
  - [ ] File monitoring
  - [ ] Session tracking
  - [ ] Break alerts
  - [ ] Notifications
  - [ ] Search functionality
  - [ ] Data export

### Phase 3: Performance Testing
- [ ] Run performance benchmarks
- [ ] Check memory usage (currently 96.8%)
- [ ] Verify response times
- [ ] Test concurrent connections
- [ ] Load test with multiple projects

### Phase 4: Security Testing
- [ ] Verify Helmet.js still works
- [ ] Test rate limiting
- [ ] Check CORS configuration
- [ ] Validate input validation (Joi)
- [ ] Test authentication flow
- [ ] Security headers verification

---

## Rollback Plan

### Pre-Upgrade Backup
```bash
# 1. Create backup branch
git checkout -b express-5-upgrade
git push origin express-5-upgrade

# 2. Tag current state
git tag pre-express-5-upgrade
git push origin pre-express-5-upgrade

# 3. Backup package-lock.json
cp backend/package-lock.json backend/package-lock.json.backup
```

### If Upgrade Fails
```bash
# Rollback to Express 4.x
cd backend
npm install express@4.21.2
npm audit fix

# Or restore from backup
cp backend/package-lock.json.backup backend/package-lock.json
npm ci

# Restart servers
./restart.sh
```

---

## Step-by-Step Upgrade Process

### Step 1: Preparation (30 minutes)
```bash
# 1. Create upgrade branch
git checkout -b express-5-upgrade

# 2. Backup current state
git commit -am "Pre Express 5 upgrade checkpoint"

# 3. Document current test results
cd backend && npm test > test-results-before.txt

# 4. Check dependency compatibility
npm outdated
```

### Step 2: Upgrade Express (15 minutes)
```bash
# 1. Update Express
npm install express@5.1.0

# 2. Check for peer dependency warnings
npm install

# 3. Rebuild native modules (if needed)
npm rebuild

# 4. Verify installation
npm list express
```

### Step 3: Code Updates (1-2 hours)
```bash
# 1. Search for deprecated patterns
grep -r "res\.json([0-9]" backend/
grep -r "res\.send([0-9]" backend/

# 2. Update deprecated code
# (Manual code changes)

# 3. Run linter
npm run lint
npm run lint:fix
```

### Step 4: Testing (1-2 hours)
```bash
# 1. Run unit tests
npm test

# 2. Run integration tests
npm run test:integration

# 3. Start servers
./start.sh

# 4. Manual testing
# - Test each major feature
# - Check browser console for errors
# - Monitor backend logs

# 5. Document test results
npm test > test-results-after.txt
diff test-results-before.txt test-results-after.txt
```

### Step 5: Deployment (if successful)
```bash
# 1. Commit changes
git add .
git commit -m "Upgrade to Express 5.1.0

- Updated Express from 4.21.2 to 5.1.0
- Fixed deprecated response methods
- Updated middleware signatures
- All tests passing
- Verified in local environment"

# 2. Push to remote
git push origin express-5-upgrade

# 3. Create pull request
# - Include test results
# - Document breaking changes
# - List all changes made

# 4. Merge after review
git checkout master
git merge express-5-upgrade
git push origin master

# 5. Tag release
git tag v1.6.0-express5
git push origin v1.6.0-express5
```

---

## Known Issues to Watch For

### 1. Middleware Order Sensitivity
Express 5 may be more strict about middleware order. Watch for:
- Error handling middleware placement
- CORS middleware timing
- Authentication middleware position

### 2. Route Parameter Matching
More strict regex matching may break:
- Dynamic route parameters
- Optional parameters
- Wildcard routes

### 3. Error Handler Signature
Error handling middleware must have exactly 4 parameters:
```javascript
// Correct
app.use((err, req, res, next) => { ... });

// Wrong (will not catch errors in Express 5)
app.use((err, req, res) => { ... });
```

### 4. Response Header Timing
Some header-setting methods may be more strict about when headers can be set.

---

## Success Criteria

**Upgrade is successful if:**
- [ ] All 574 tests pass (or >95% with documented failures)
- [ ] All 136 endpoints respond correctly
- [ ] Frontend loads without errors
- [ ] WebSocket connections work
- [ ] No memory leaks observed
- [ ] Performance equal or better than Express 4
- [ ] Security headers still apply
- [ ] No regression in functionality

**Upgrade should be rolled back if:**
- ❌ >10% of tests fail
- ❌ Critical endpoints broken
- ❌ WebSocket connections fail
- ❌ Memory usage increases >20%
- ❌ Response times degrade >50%
- ❌ Security features broken

---

## Timeline

### Conservative Approach (Recommended)
- **Week 1:** Planning + dependency research
- **Week 2:** Upgrade in development branch
- **Week 3:** Testing + bug fixes
- **Week 4:** Production deployment

### Aggressive Approach
- **Day 1:** Upgrade + initial testing
- **Day 2:** Fix breaking changes
- **Day 3:** Integration testing
- **Day 4:** Deploy to production

**Recommended:** Conservative approach (4 weeks)

---

## Post-Upgrade Tasks

### Immediate (Week 1)
- [ ] Monitor error logs closely
- [ ] Watch memory usage
- [ ] Track response times
- [ ] Collect user feedback

### Short-term (Week 2-4)
- [ ] Simplify error handling (remove redundant try/catch)
- [ ] Optimize using new Express 5 features
- [ ] Update documentation
- [ ] Update CHANGELOG.md

### Long-term (Months)
- [ ] Refactor middleware to use new patterns
- [ ] Leverage async/await improvements
- [ ] Performance optimization
- [ ] Code cleanup

---

## Benefits of Upgrading

### Performance
- ✅ Better async/await support
- ✅ Faster routing engine
- ✅ Improved memory usage
- ✅ Better promise handling

### Developer Experience
- ✅ Simpler error handling
- ✅ Better TypeScript support
- ✅ Modern JavaScript features
- ✅ Cleaner async code

### Security
- ✅ Latest security patches
- ✅ Better vulnerability protection
- ✅ Ongoing support

### Future-Proofing
- ✅ Active development
- ✅ Long-term support
- ✅ Community adoption
- ✅ Plugin ecosystem

---

## Resources

### Official Documentation
- [Express 5.x Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
- [Express 5.x Changelog](https://github.com/expressjs/express/blob/5.0/History.md)
- [Express 5.x API Documentation](https://expressjs.com/en/5x/api.html)

### Community Resources
- Stack Overflow: `[express] [express5]`
- GitHub Issues: expressjs/express
- Express Community: Discord/Forums

### Raven-Specific
- Test suite: `backend/__tests__/`
- Route modules: `backend/routes/`
- Middleware: `backend/middleware/`
- Server config: `backend/server.js`

---

## Decision: Proceed with Upgrade?

### Recommendation: YES, but with caution

**Pros:**
- Security updates
- Performance improvements
- Better async support
- Future-proofing

**Cons:**
- Breaking changes require testing
- Potential for temporary issues
- Time investment (2-4 hours)

**Suggested Timeline:**
- Plan: 1 week
- Implement: 1-2 days
- Test: 3-5 days
- Deploy: After thorough testing

**Final Decision:** [Pending team/stakeholder approval]

---

**Document Version:** 1.0
**Created:** October 26, 2025
**Author:** Claude Code Deep Audit
**Status:** Draft - Awaiting Approval
