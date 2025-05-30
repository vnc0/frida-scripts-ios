/**
 * Ensures that a native module is loaded and executes callback functions when the module is ready.
 *
 * @param {string} targetModuleName - The name of the module
 * @param {Function} callback - Callback function to execute when the module is loaded
 * @returns {void}
 */
function onModuleReady(targetModuleName, callback) {
  let moduleAddress;
  try {
    moduleAddress = Process.getModuleByName(targetModuleName).base;
  } catch (e) {
    moduleAddress = null;
  }

  if (!moduleAddress) {
    console.log(
      `[-] Module '${targetModuleName}' not currently loaded. Setting up load listener...`,
    );

    Interceptor.attach(Module.getGlobalExportByName("dlopen"), {
      onEnter: function (args) {
        var libPathPtr = args[0];
        if (libPathPtr !== undefined && libPathPtr != null) {
          var libPath = ptr(libPathPtr).readCString();
          if (libPath.indexOf(targetModuleName) >= 0) {
            this.isTargetLib = true;
          }
        }
      },
      onLeave: function (retval) {
        if (this.isTargetLib) {
          let loadedModuleAddress;
          try {
            loadedModuleAddress = Process.getModuleByName(targetModuleName).base;
            console.log(
              `[+] Module '${targetModuleName}' now loaded at address: ${loadedModuleAddress}`,
            );
            callback(loadedModuleAddress);
          } catch (e) {
            console.log(`[-] Failed to get address of loaded module '${targetModuleName}'`);
          }
        }
      },
    });
  } else {
    console.log(
      `[+] Module '${targetModuleName}' already loaded at address: ${moduleAddress}`,
    );
    callback(moduleAddress);
  }
}

/**
 * Ensures that the Objective-C runtime is available and executes a callback function when it is ready.
 *
 * @param {Function} callback - Callback function to execute when the Objective-C runtime is available
 * @returns {void}
 */
function objcReady(callback) {
  if (ObjC.available) {
    console.log("[+] ObjC Runtime available");
    callback();
  } else {
    console.log("[-] ObjC Runtime not available!");
  }
}
