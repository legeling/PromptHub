#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: spec-init.sh [target_dir] [--here] [--name NAME] [--type TYPE] [--lang LANG] [--force]
Creates README.md, AGENTS.md, and docs/README.md only.
Types: web, api, cli, library, service. Languages: zh (default), en.
Existing files are preserved. --force backs up and replaces these three files only.
HELP
}
fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }
value() {
  [[ -n "${2:-}" && "$2" != --* ]] || fail "$1 requires a value"
}
TARGET=""
NAME=""
TYPE=""
LANGUAGE=zh
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --here) [[ -z "$TARGET" ]] || fail 'multiple targets'; TARGET=.; shift ;;
    --name|--type|--lang)
      value "$1" "${2:-}"
      case "$1" in --name) NAME="$2";; --type) TYPE="$2";; --lang) LANGUAGE="$2";; esac
      shift 2 ;;
    --name=*) NAME="${1#*=}"; [[ -n "$NAME" ]] || fail '--name requires a value'; shift ;;
    --type=*) TYPE="${1#*=}"; [[ -n "$TYPE" ]] || fail '--type requires a value'; shift ;;
    --lang=*) LANGUAGE="${1#*=}"; [[ -n "$LANGUAGE" ]] || fail '--lang requires a value'; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) fail "unknown option: $1" ;;
    *) [[ -z "$TARGET" ]] || fail 'multiple targets'; TARGET="$1"; shift ;;
  esac
done
LANGUAGE="$(printf '%s' "$LANGUAGE" | tr '[:upper:]' '[:lower:]')"
TYPE="$(printf '%s' "$TYPE" | tr '[:upper:]' '[:lower:]')"
case "$LANGUAGE" in zh|en) ;; *) fail "Unsupported language: $LANGUAGE";; esac
case "$TYPE" in ''|web|api|cli|library|service) ;; *) fail "Unsupported project type: $TYPE";; esac
[[ "$NAME" != *$'\n'* && "$NAME" != *$'\r'* ]] || fail 'project name must be one line'
TARGET="${TARGET:-.}"

# Inspect each component before normalizing '..', so links cannot hide in a path.
safe_directory() {
  local input="$1" current=/ part
  local -a components
  [[ "$input" == /* ]] || input="$(pwd -P)/$input"
  IFS=/ read -r -a components <<< "$input"
  for part in "${components[@]}"; do
    case "$part" in ''|.) continue;; ..) current="$(dirname "$current")"; continue;; esac
    current="${current%/}/$part"
    [[ ! -L "$current" ]] || fail "symlink directory refused: $current"
    [[ ! -e "$current" || -d "$current" ]] || fail "not a directory: $current"
  done
  printf '%s' "$current"
}
[[ "$TARGET" != *$'\n'* && "$TARGET" != *$'\r'* ]] || fail 'target must be one line'
TARGET="$(safe_directory "$TARGET")"
safe_directory "$TARGET/docs" >/dev/null
[[ -n "$NAME" ]] || NAME="$(basename "$TARGET")"
REASON='explicit --type'
if [[ -z "$TYPE" ]]; then
  keywords="$(printf '%s' "$NAME $(basename "$TARGET")" | tr '[:upper:]' '[:lower:]')"
  case "$keywords" in
    *cli*|*command*|*cmd*|*tool*) TYPE=cli;;
    *api*|*backend*|*server*|*bff*) TYPE=api;;
    *web*|*site*|*frontend*|*admin*|*dashboard*|*portal*|*ui*) TYPE=web;;
    *sdk*|*lib*|*library*|*package*|*plugin*|*kit*) TYPE=library;;
    *) TYPE=service;;
  esac
  REASON='name-based hint; confirm against actual code'
fi
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
FILES=(README.md AGENTS.md docs/README.md)
for file in "${FILES[@]}"; do
  [[ -f "$ROOT/assets/templates/project/$LANGUAGE/$file.tmpl" ]] || fail "missing template: $file"
  [[ ! -L "$TARGET/$file" ]] || fail "symlink file refused: $TARGET/$file"
  [[ ! -e "$TARGET/$file" || -f "$TARGET/$file" ]] || fail "not a regular file: $TARGET/$file"
done

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/spec-init-render.XXXXXX")"
WRITE_TEMP=""
cleanup() {
  [[ -z "$WRITE_TEMP" ]] || rm -f -- "$WRITE_TEMP"
  rm -rf -- "$STAGE"
}
trap cleanup EXIT
export SPEC_INIT_NAME="$NAME" SPEC_INIT_TYPE="$TYPE" SPEC_INIT_REASON="$REASON"
export SPEC_INIT_DATE="$(date +%F)"
for file in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$file")"
  # Substitute once: project names containing placeholder syntax remain literal.
  awk '
    BEGIN {
      values["__PROJECT_NAME__"]=ENVIRON["SPEC_INIT_NAME"]
      values["__PROJECT_TYPE__"]=ENVIRON["SPEC_INIT_TYPE"]
      values["__PROJECT_TYPE_REASON__"]=ENVIRON["SPEC_INIT_REASON"]
      values["__DATE__"]=ENVIRON["SPEC_INIT_DATE"]
    }
    {
      line=$0
      while (match(line, /__PROJECT_NAME__|__PROJECT_TYPE__|__PROJECT_TYPE_REASON__|__DATE__/)) {
        printf "%s%s", substr(line,1,RSTART-1), values[substr(line,RSTART,RLENGTH)]
        line=substr(line,RSTART+RLENGTH)
      }
      print line
    }
  ' "$ROOT/assets/templates/project/$LANGUAGE/$file.tmpl" > "$STAGE/$file"
done

BACKUP_ROOT=""
if [[ "$FORCE" -eq 1 ]]; then
  for file in "${FILES[@]}"; do
    if [[ -f "$TARGET/$file" ]]; then
      BACKUP_ROOT="${SPEC_INIT_BACKUP_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/spec-init/backups}"
      [[ "$BACKUP_ROOT" != *$'\n'* && "$BACKUP_ROOT" != *$'\r'* ]] || fail 'backup root must be one line'
      BACKUP_ROOT="$(safe_directory "$BACKUP_ROOT")"
      [[ "$TARGET" != / && "$BACKUP_ROOT" != "$TARGET" && "$BACKUP_ROOT" != "$TARGET/"* ]] || fail 'backup root must be outside the project'
      break
    fi
  done
fi
mkdir -p "$TARGET/docs"
BACKUP=""
if [[ "$FORCE" -eq 1 ]]; then
  for file in "${FILES[@]}"; do
    if [[ -f "$TARGET/$file" ]]; then
      if [[ -z "$BACKUP" ]]; then
        mkdir -p "$BACKUP_ROOT"
        BACKUP="$(mktemp -d "$BACKUP_ROOT/scaffold.XXXXXX")"
        printf 'Historical backup only. Not current project instructions.\nOriginal project: %s\nRestore files/ to the original relative paths, preserving later edits.\n' "$TARGET" > "$BACKUP/RESTORE.txt"
        printf 'Backup: %s\n' "$BACKUP"
        printf 'Restore only the saved files to their original relative paths; preserve later edits.\n'
      fi
      mkdir -p "$BACKUP/files/$(dirname "$file")"
      cp -p "$TARGET/$file" "$BACKUP/files/$file"
    fi
  done
fi
for file in "${FILES[@]}"; do
  if [[ -f "$TARGET/$file" && "$FORCE" -eq 0 ]]; then
    printf 'skip  %s (already exists)\n' "$TARGET/$file"
  else
    # Stage beside the destination so replacement is an atomic rename on its filesystem.
    WRITE_TEMP="$(mktemp "$TARGET/$(dirname "$file")/.spec-init-write.XXXXXX")"
    if ! cp "$STAGE/$file" "$WRITE_TEMP" || ! chmod 644 "$WRITE_TEMP" || ! mv -f "$WRITE_TEMP" "$TARGET/$file"; then
      fail "write failed: $TARGET/$file; restore saved files from ${BACKUP:-no backup (new files only)}"
    fi
    WRITE_TEMP=""
    printf 'write %s\n' "$TARGET/$file"
  fi
done
printf 'Scaffold ready: %s\n' "$TARGET"
printf 'Read relevant code and fill real agreements only when needed. No project rules were migrated.\n'
