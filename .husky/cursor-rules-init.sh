#!/bin/bash

# Cursor Rules Initialization Script
#
# Initializes Flipdish cursor rules by cloning flipdishbytes/cursor-rules into
# .cursor/rules/flipdish. Intended for: "prepare": "husky && npm run cursor:init"
#
# Caching: writes .cursor/rules/.flipdish-cursor-rules.revision with the
# cloudflare-app-template branch SHA from git ls-remote. If that file matches
# the current remote SHA and the rules directory is non-empty, skips clone
# (fast path).
#
# The clone keeps .cursor/rules/flipdish/.git (shallow) so we can detect local
# edits; any uncommitted change (including untracked files) triggers a full
# re-sync from the remote to discard them.
#
# CURSOR_RULES_INIT_FORCE=1 — ignore revision cache and re-clone.
#
# Skips entirely in GitHub Actions (GITHUB_RUN_ID set).

set -u
set -o pipefail

export GIT_TERMINAL_PROMPT=0

REVISION_FILE=".cursor/rules/.flipdish-cursor-rules.revision"
RULES_DIR=".cursor/rules/flipdish"
CURSOR_RULES_BRANCH="cloudflare-app-template"

rules_dir_nonempty() {
    [ -d "$RULES_DIR" ] && [ -n "$(ls -A "$RULES_DIR" 2>/dev/null)" ]
}

# True when the rules checkout has a git working tree with local modifications,
# staged changes, or untracked files (requires .git; legacy trees without .git
# are not checked this way).
flipdish_has_local_changes() {
    [ -d "$RULES_DIR/.git" ] || return 1
    [ -n "$(git -C "$RULES_DIR" status --porcelain 2>/dev/null)" ]
}

if [ -n "${GITHUB_RUN_ID:-}" ]; then
    exit 0
fi

if [ ! -f ".git/config" ]; then
    echo "Error: .git/config not found"
    exit 1
fi

remote_url=$(git config --get remote.origin.url)
if [[ $remote_url == git@* ]]; then
    hostname=$(echo "$remote_url" | awk -F'@' '{print $2}' | awk -F':' '{print $1}')
elif [[ $remote_url == https://* ]]; then
    hostname=$(echo "$remote_url" | awk -F'//' '{print $2}' | awk -F'/' '{print $1}')
else
    echo "Warning: Could not determine remote URL type"
    exit 1
fi

if [[ $remote_url == git@* ]]; then
    rules_repo_url="git@${hostname}:flipdishbytes/cursor-rules.git"
elif [[ $remote_url == https://* ]]; then
    rules_repo_url="https://${hostname}/flipdishbytes/cursor-rules.git"
else
    echo "Warning: Could not determine remote URL type"
    exit 1
fi

mkdir -p .cursor/rules

remote_sha=$(git ls-remote "$rules_repo_url" "refs/heads/${CURSOR_RULES_BRANCH}" 2>/dev/null | awk '{print $1; exit}')
if [ -z "$remote_sha" ]; then
    if rules_dir_nonempty; then
        echo "Warning: Could not reach cursor-rules remote; keeping existing .cursor/rules/flipdish."
        exit 0
    fi
    echo "Error: Could not reach cursor-rules remote and $RULES_DIR is missing or empty."
    exit 1
fi

if flipdish_has_local_changes; then
    echo "Detected local changes in $RULES_DIR; re-syncing from cursor-rules..."
# Require .git so we can detect future local edits; trees from older script
# versions (no .git) take one re-clone here, then stay on the fast path.
elif [ "${CURSOR_RULES_INIT_FORCE:-}" != "1" ] && [ -f "$REVISION_FILE" ] && rules_dir_nonempty && [ -d "$RULES_DIR/.git" ]; then
    stored_sha=$(head -n 1 "$REVISION_FILE" | tr -d '[:space:]')
    if [ -n "$stored_sha" ] && [ "$stored_sha" = "$remote_sha" ]; then
        echo "Flipdish Cursor rules already up to date ($remote_sha)."
        exit 0
    fi
fi

rm -rf "$RULES_DIR"

if [[ $remote_url == git@* ]]; then
    echo "Detected SSH remote URL, cloning with SSH..."
    git clone --depth 1 -b "$CURSOR_RULES_BRANCH" "$rules_repo_url" "$RULES_DIR" || exit 1
elif [[ $remote_url == https://* ]]; then
    echo "Detected HTTPS remote URL, cloning with HTTPS..."
    git clone --depth 1 -b "$CURSOR_RULES_BRANCH" "$rules_repo_url" "$RULES_DIR" || exit 1
else
    echo "Warning: Could not determine remote URL type"
    exit 1
fi

printf '%s\n' "$remote_sha" >"$REVISION_FILE"
echo "Flipdish Cursor rules initialization complete! ($remote_sha)"
