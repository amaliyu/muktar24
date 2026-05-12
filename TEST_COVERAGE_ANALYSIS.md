# Test Coverage Analysis & Improvement Plan

## Current State

The codebase is a **monolithic React component** with no existing tests. All logic is contained in `src/App.jsx`:
- **Total lines of code**: ~778 lines
- **Test coverage**: 0%
- **Test files**: None

## Architecture Issues Affecting Testability

1. **No component separation** - All pages (Dashboard, Production, Orders, Staff, Waybills, Reports) are in a single file
2. **No utility functions** - All logic is inline (calculations, formatting, state management)
3. **No data layer** - Sample data is hardcoded; no data fetching or API integration
4. **Inline styling** - Style definitions embedded throughout, making CSS testing difficult
5. **Complex state management** - Uses React hooks but no centralized state management

---

## Test Coverage Gaps & Recommendations

### 1. **Component Unit Tests** (High Priority)

**Currently missing:**
- No tests for individual components (Dashboard, Production, Orders, etc.)
- No tests for reusable components (StatCard, Icon)

**Recommended tests:**
```
src/components/
├── Dashboard.test.jsx
├── Production.test.jsx
├── Orders.test.jsx
├── Staff.test.jsx
├── Waybills.test.jsx
├── Reports.test.jsx
├── StatCard.test.jsx
└── Icon.test.jsx
```

**What to test:**
- StatCard renders label, value, and sub correctly
- Icon component returns correct emoji for icon names
- Dashboard displays sample data correctly
- Orders page allows selecting and viewing order details
- Production form toggle shows/hides correctly

---

### 2. **Navigation & Routing Logic** (High Priority)

**Currently missing:**
- No tests for page switching between dashboard sections
- No tests for active state styling

**Recommended approach:**
```javascript
// Test that clicking a nav item changes the active page
test('clicking nav item changes active page', () => {
  render(<App />);
  fireEvent.click(screen.getByText('Production'));
  expect(screen.getByText('Production Log')).toBeInTheDocument();
});
```

---

### 3. **Form Handling Tests** (Medium Priority)

**Currently missing:**
- No tests for Production form input changes
- No tests for form reset/cancel functionality
- No validation tests

**What to test:**
- Form fields update state on input change
- "Cancel" button hides the form
- "Save" button handling (when implemented)
- Form validation for required fields (when added)

**Example:**
```javascript
test('Production form inputs update state', () => {
  render(<App />);
  fireEvent.click(screen.getByText('+ Log Today\'s Production'));
  const dateInput = screen.getByType('date');
  fireEvent.change(dateInput, { target: { value: '2026-05-12' } });
  expect(dateInput.value).toBe('2026-05-12');
});
```

---

### 4. **Data & Calculations Tests** (Medium Priority)

**Currently missing:**
- No tests for calculations (net output, damage percentages, payment progress)
- No tests for data formatting (currency, thousands separator)

**What to test:**
- Net output calculation: `produced - damaged.production - damaged.stacking`
- Payment progress percentage: `(paid / totalValue) * 100`
- Delivery progress: `(delivered / totalQty) * 100`
- Number formatting with `toLocaleString()`
- Currency formatting

**Example:**
```javascript
test('net output calculation is correct', () => {
  const prod = 850, dmgProd = 4, dmgStack = 2;
  const net = prod - dmgProd - dmgStack;
  expect(net).toBe(844);
});
```

---

### 5. **UI Rendering & Data Display** (Medium Priority)

**Currently missing:**
- No tests for table rendering with sample data
- No tests for badge color logic based on status
- No tests for conditional rendering

**What to test:**
- All 3 orders render in Orders page
- All 5 staff members display in Staff table
- All 3 waybills show in Waybills table
- Badge colors match status (completed = green, invoiced = blue, in_progress = orange)
- Empty state message shows when no order selected

**Example:**
```javascript
test('renders all sample orders', () => {
  render(<App />);
  fireEvent.click(screen.getByText('Orders & Invoicing'));
  expect(screen.getByText('Metama Housing')).toBeInTheDocument();
  expect(screen.getByText('Gwarinpa Developers')).toBeInTheDocument();
  expect(screen.getByText('Kubwa Estate')).toBeInTheDocument();
});
```

---

### 6. **Integration Tests** (Low-Medium Priority)

**Currently missing:**
- No end-to-end user flow tests
- No tests for complete user interactions (navigate → view → interact → verify)

**Recommended scenarios:**
```
1. User navigates to Production > logs entry > cancels
2. User navigates to Orders > selects customer > views invoice details
3. User navigates between all pages in sequence
4. User interacts with Production form and cancels
```

---

## Refactoring Recommendations (Before Testing)

To make the codebase more testable, consider:

### 1. **Extract Components**
```
src/components/
├── Layout.jsx          # Sidebar + main layout
├── pages/
│   ├── Dashboard.jsx
│   ├── Production.jsx
│   ├── Orders.jsx
│   ├── Staff.jsx
│   ├── Waybills.jsx
│   └── Reports.jsx
├── common/
│   ├── StatCard.jsx
│   ├── Icon.jsx
│   └── Badge.jsx
└── hooks/
    └── useNavigation.jsx
```

### 2. **Extract Utilities**
```
src/utils/
├── calculations.js      # Net output, percentages, totals
├── formatting.js        # Currency, numbers, dates
├── theme.js            # Theme constants
└── data.js             # Sample data (move from App)
```

### 3. **Extract Custom Hooks**
```
src/hooks/
├── useNavigation.js    # Page state management
├── useProductionForm.js # Production form state
└── useOrderSelection.js # Order selection state
```

### 4. **Create Style Constants**
```
src/styles/
├── theme.js            # theme object
└── styleFactory.js     # Dynamic style generators
```

---

## Testing Strategy Timeline

### Phase 1: Setup (Completed)
✅ Vitest + React Testing Library configured
✅ Test infrastructure ready

### Phase 2: High-Impact Tests (Week 1-2)
- Component rendering tests (StatCard, Icon)
- Page navigation tests
- Orders page selection logic

### Phase 3: Mid-Priority Tests (Week 2-3)
- Form handling (Production form)
- Data calculations
- Table rendering with sample data

### Phase 4: Integration Tests (Week 3-4)
- Full user flows
- Cross-page interactions
- Conditional rendering scenarios

### Phase 5: Refactoring (Ongoing)
- Component extraction
- Utility function separation
- Hook extraction

---

## Coverage Goals

| Category | Current | Target | Priority |
|----------|---------|--------|----------|
| Components | 0% | 80%+ | High |
| Pages | 0% | 75%+ | High |
| Utilities | N/A | 100% | Medium |
| Integration | 0% | 60%+ | Medium |
| **Overall** | **0%** | **70%+** | **High** |

---

## Getting Started

1. **Run existing infrastructure tests:**
   ```bash
   npm test
   ```

2. **Start with component tests:**
   ```bash
   # Create src/components/StatCard.test.jsx
   # Create src/components/Icon.test.jsx
   ```

3. **Build coverage reports:**
   ```bash
   npm run test:coverage
   ```

4. **Monitor coverage growth:**
   ```bash
   npm run test:ui
   ```

---

## Quick Wins (Start Here)

These tests are easy to write and provide immediate value:

1. ✅ **Icon component** - Straightforward emoji mapping (5 min)
2. ✅ **StatCard rendering** - Props display correctly (10 min)
3. ✅ **Navigation switching** - Page changes on click (15 min)
4. ✅ **Sample data renders** - Orders/staff/waybills appear (20 min)
5. ✅ **Form toggle** - Show/hide production form (10 min)

**Estimated time to 30% coverage: 1-2 hours**
