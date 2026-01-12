# Validation Instructions

## VERIFICATION PROCESS (REQUIRED)

For EVERY issue, before deciding to keep or filter:

1. **Read the code**: Use Read tool to examine the file at specified lines
2. **Verify the claim**: Check if the described problem actually exists
3. **Trace the flow**: For security/performance issues, trace through actual implementation
4. **Document your finding**: Note what you found vs what was claimed (becomes the `reason`)

## CHECK FOR INTENTIONAL DESIGN DECISIONS (CRITICAL!)

Before marking an issue as valid, check if the change was INTENTIONAL:

1. **Check code comments and inline documentation:**
   - Read comments in the flagged code and surrounding context
   - Look for explanations like "Simple O(n²) approach is sufficient for..."
   - Check for performance/complexity justifications
   - Look for security trade-off explanations
   - Comments starting with "Note:", "IMPORTANT:", "Why:" are deliberate decisions

2. **Check project documentation:**
   - Read CLAUDE.md, README.md for architectural decisions
   - Check for explicit patterns or conventions documented
   - Look for "Development Notes", "Architecture" sections
   - Check if the flagged pattern is a documented standard

3. **Check commit messages:**
   - Look for explanations of WHY the change was made
   - Look for trade-off discussions ("speeds up X at cost of Y")
   - Look for bug fix context ("fixes timeout errors", "prevents race condition")

4. **Recognize deliberate trade-off patterns:**
   - "Lazy → Eager initialization" often FIXES timeout/context errors
   - "Fine-grained → Coarse locking" trades parallelism for correctness
   - Moving code to constructor/startup often fixes runtime errors
   - Keywords in commits: "fixes", "prevents", "to avoid", "instead of"
   - Simplicity over optimization (e.g., "sufficient for typical use case")

**An issue is FALSE POSITIVE if:**
- Code has explanatory comments justifying the approach
- Project documentation explicitly allows/recommends this pattern
- Commit message shows the change intentionally introduces the "problem" to fix something else
- The author explicitly chose this trade-off with rationale
- The "issue" is actually the FIX for a different bug

## Common False Positive Patterns (ALWAYS FILTER)

1. **API/Property existence claims**: "X doesn't exist" or "X behaves differently"
   → FILTER if you cannot prove the API actually behaves as claimed

2. **Missing handler claims**: "error not handled", "cleanup not done"
   → READ the ENTIRE function — FILTER if handling exists elsewhere

3. **Null/undefined crash claims**: "X may be null and cause crash"
   → FILTER if configuration or initialization guarantees the value exists

4. **Ignoring intentional design**: Issue flags code that has explanatory comments or is documented
   → FILTER if code has comments explaining WHY (e.g., "Simple approach is sufficient for...")
   → FILTER if CLAUDE.md or README.md documents this as an intentional pattern
   → FILTER if the "problem" is actually a documented trade-off

5. **Severity inflation**: Exaggerated impact or unrealistic attack vectors
   → FILTER if severity is overstated given actual code safeguards

6. **Intentional changes flagged as bugs**: Removed/refactored features
   → FILTER if the change is clean and deliberate

## Example

Input issues: id=1 (SQL injection), id=2 (null check), id=3 (performance trade-off)

After verification:
- Issue 1: Read code at lines 45-50, confirmed user input concatenated into SQL → KEEP (confidence: 95)
- Issue 2: Read code, found null check exists on line 42 → FILTER (confidence: 15, reason: "False positive - null check exists on line 42")
- Issue 3: Commit message says "intentional for performance" → FILTER (confidence: 10, reason: "Intentional trade-off per commit message")

Output:
```json
{
  "issues": [{"id": 1, "confidence": 95}],
  "filtered_issues": [
    {"id": 2, "confidence": 15, "reason": "False positive - null check exists on line 42"},
    {"id": 3, "confidence": 10, "reason": "Intentional trade-off per commit message"}
  ]
}
```
