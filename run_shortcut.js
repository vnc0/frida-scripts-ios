const { NSURL, LSApplicationWorkspace } = ObjC.classes;

/**
 * Runs a specified shortcut with the given input.
 *
 * @param {string} name - The name of the shortcut to run.
 * @param {string} input - The input to pass to the shortcut.
 * @returns {boolean} - Returns true if the URL was successfully opened, otherwise false.
 */
function runShortcut(name, input) {
    const urlString = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(name)}&input=${encodeURIComponent(input)}`;
    const url = NSURL.URLWithString_(urlString);
    const workspace = LSApplicationWorkspace.defaultWorkspace();
    return workspace.openURL_(url);
}

// Usage example
const success = runShortcut("reconnect", "");
