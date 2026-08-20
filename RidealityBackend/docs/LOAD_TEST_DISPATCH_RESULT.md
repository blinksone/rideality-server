# Dispatch load test result

**Script:** `scripts/load-test-dispatch.ts`  
**Command:** `npx tsx scripts/load-test-dispatch.ts` (or `npm run test:dispatch`)  
**Date:** 2026-08-10

## Config

- 50 mock online drivers (Redis GEO within ~3km of Karachi center)
- 15 concurrent `REQUESTED` rides
- Auto-accept loop records `dispatch:response` for pending offers (~70% accept rate)

## Result

```
drivers=50 rides=15
dispatch_logs=12 rides_with_accept=12
double_dispatch_rides=0
RESULT: PASS (zero double-dispatch)
```

**Pass criterion met:** no ride has more than one `DispatchLog` with `response = accepted`.

Note: 3 rides may leave without an accept within the run window (timeouts / depleted candidate locks); that is **not** a double-dispatch failure.
