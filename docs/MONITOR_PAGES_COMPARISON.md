# Live Feed vs Event Log vs Activity Log - Feature Comparison

## Full Feature Matrix

| Feature | Live Feed | Event Log | Activity Log |
|---------|-----------|-----------|--------------|
| **Purpose** | Real-time code monitoring | File audit trail | Unified timeline of EVERYTHING |
| **File Events** | ✅ (in activity stream) | ✅ Primary focus | ✅ Included |
| **Agent Events** | ✅ (in activity stream) | ❌ Not included | ✅ Included |
| **System Events** | ❌ | ❌ | ✅ Included |
| **Code Diffs** | ✅ Full diffs with syntax highlighting | ❌ | ❌ |
| **Search** | ❌ | ✅ By filename | ✅ By text |
| **Filters** | ❌ | ✅ By type, date range | ✅ By category (files/agents/system) |
| **Timeline Slider** | ❌ | ✅ Visual timeline | ❌ |
| **Export** | ❌ | ✅ JSON + CSV | ✅ JSON only |
| **Pagination** | ❌ (shows last 50) | ✅ Virtual scroll (1000+) | ✅ Load more (100 at a time) |
| **Real-time Updates** | ✅ WebSocket | ✅ WebSocket | ✅ WebSocket |
| **Metadata** | Basic | Timestamp, CPU, Memory | Full metadata + expandable |
| **Session Filtering** | ❌ | ❌ | ✅ Shows session IDs |

---

## The Overlap Problem

**Activity Log = Event Log + Agent Events + System Events**

Basically:
- **Event Log** → Files only, better filters, timeline, export CSV
- **Activity Log** → Everything (files + agents + system), basic search, metadata

---

## Three Options to Resolve Overlap

### Option 1: Keep All Three (Current State)
- **Live Feed** = Real-time diffs (unique - keep)
- **Event Log** = File audit with advanced features
- **Activity Log** = Unified everything

**Pros:**
- No work required
- Specialized views for different use cases

**Cons:**
- Confusing - users don't know which to use for file events
- Redundant features
- More maintenance burden

---

### Option 2: Merge Event Log → Activity Log ⭐ RECOMMENDED
Remove Event Log, enhance Activity Log with Event Log's features:
- Add timeline slider
- Add CSV export
- Improve filtering (date range, better search)
- Keep virtual scrolling performance

**Result:** One unified log for everything

**Pros:**
- Single source of truth for all activity
- Less confusion - one place to see everything
- Cleaner UI - fewer tabs
- Still have Live Feed for real-time diffs

**Cons:**
- Need to implement Event Log features in Activity Log
- Some work required

**Final State:**
- **Live Feed** → Real-time diffs + activity stream
- **Activity Log** → Everything unified with power features (timeline, export, filters)

---

### Option 3: Keep Event Log, Remove Activity Log
Activity Log doesn't add much value:
- Event Log is more polished for file tracking
- Agents page already shows agent activity
- System events could go to Status page

**Pros:**
- Event Log is already feature-complete
- Less work - just remove Activity Log

**Cons:**
- Lose unified view of files + agents + system
- Have to check multiple pages for complete picture
- Agent events don't have a timeline view

**Final State:**
- **Live Feed** → Real-time diffs + activity stream
- **Event Log** → File audit trail only

---

## Recommendation: Option 2

**Merge Event Log into Activity Log** because:

1. **Unified view is valuable** - seeing files + agents + system in one timeline
2. **Activity Log has better foundation** - already supports multiple event types
3. **Event Log's features can be added** - timeline, CSV export, better filters
4. **Cleaner navigation** - Monitor has 2 tabs instead of 3
5. **Less confusion** - one log for everything

### Implementation Tasks:
- [ ] Add timeline slider to Activity Log
- [ ] Add CSV export to Activity Log
- [ ] Improve date range filtering
- [ ] Add virtual scrolling for performance
- [ ] Remove Event Log tab
- [ ] Remove EventFeed.svelte component

---

## Summary

**Current:**
- Monitor → Live Feed | Event Log | Activity Log (3 tabs)
- Overlap between Event Log and Activity Log for file events

**Recommended:**
- Monitor → Live Feed | Activity Log (2 tabs)
- Activity Log becomes the unified, feature-rich log for everything
- Live Feed stays unique (real-time diffs)
