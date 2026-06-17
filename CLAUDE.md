# Claude Instructions for This Repository

When working in this project, Claude must load and follow all repository rules from:

- `.cursor/rules/`
- `.cursor/rules/flipdish/` (including nested rule files)

## Required behavior

1. Read all available rule files in the paths above before making changes.
2. Apply those rules as hard constraints for planning, edits, testing, and responses.
3. If any rule appears to conflict, prefer the more specific rule.
4. If rules are missing locally, run:

```bash
npm run cursor:init
```

To force refresh of the synced Flipdish rules:

```bash
CURSOR_RULES_INIT_FORCE=1 npm run cursor:init
```

Do not ignore or bypass these rules.
