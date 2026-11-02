#!/bin/zsh
set -eu
PACKAGE="${0:A:h}"
INSTALL_ROOT="${TODO_INSTALL_ROOT:-${HOME}/Applications}"
DESKTOP_ROOT="${TODO_DESKTOP_DIR:-${HOME}/Desktop}"
DESTINATION="$INSTALL_ROOT/Todo List Local.app"
STAGING="$INSTALL_ROOT/.Todo-List-install-$$.app"
SOURCE="$PACKAGE/Todo List Local.app"
if [[ ! -d "$SOURCE/Contents/Resources/application" ]]; then
  print 'Keep Install.command beside Todo List Local.app and try again.'
  exit 1
fi
mkdir -p "$INSTALL_ROOT" "$DESKTOP_ROOT"
if [[ -e "$DESTINATION" ]]; then
  IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$DESTINATION/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$IDENTIFIER" != "uno.todolist.local-shortcut" ]]; then
    print "Installation stopped: a different application already exists at $DESTINATION. Nothing was replaced."
    exit 1
  fi
fi
/usr/bin/ditto "$SOURCE" "$STAGING"
if [[ -d "$DESTINATION" ]]; then /bin/mv "$DESTINATION" "$INSTALL_ROOT/Todo List Local.previous-$(date -u +%Y%m%dT%H%M%SZ)-$$.app"; fi
/bin/mv "$STAGING" "$DESTINATION"
DESKTOP_LINK="$DESKTOP_ROOT/Todo List Local.app"
if [[ ! -e "$DESKTOP_LINK" && ! -L "$DESKTOP_LINK" ]]; then
  /bin/ln -s "$DESTINATION" "$DESKTOP_LINK"
elif [[ -L "$DESKTOP_LINK" && "$(readlink "$DESKTOP_LINK")" == "$DESTINATION" ]]; then
  : # The existing Shortcut already points to the newly installed files.
else
  DESKTOP_LINK="$DESKTOP_ROOT/Todo List Local Download.app"
  if [[ ! -e "$DESKTOP_LINK" && ! -L "$DESKTOP_LINK" ]]; then /bin/ln -s "$DESTINATION" "$DESKTOP_LINK"; fi
fi
print "Installed: $DESTINATION"
print 'Open Todo List Local from your Desktop or Applications to start using it in Google Chrome.'
print 'Your data stays in ~/Library/Application Support/Todo List Local/data across application updates.'
print 'The existing AI Todo List Shortcut and its saved data have not been changed.'
