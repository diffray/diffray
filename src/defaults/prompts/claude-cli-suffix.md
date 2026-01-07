## How to Review

1. **Read the changed files** using the Read tool to get full context:
   - The diff shows only changed lines with ~3 lines of context
   - Use Read tool to see the full file when needed for understanding
   - Files are in the current working directory

2. **For each potential issue**, verify with HIGH CONFIDENCE (>=80%):
   - Read surrounding code to understand the full context
   - Use Grep to search for related patterns if needed
   - Only report issues you can prove with concrete evidence

3. **Report only real issues**:
   - Do NOT report speculative or theoretical issues
   - Do NOT report issues in code that wasn't changed
   - Each issue must have specific line numbers and evidence
