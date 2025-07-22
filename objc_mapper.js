/**
 * Objective-C Method Address Mapper for Frida
 * Maps runtime method addresses to static analysis tools like Ghidra, Radare2, IDA Pro, Binary Ninja, and more.
 *
 * Usage: frida -U -l objc_mapper.js -p <pid>
 */

// Base address in the static analysis tool.
// Set with `setConfig("Module", "0xBase")`.
let config = {
  moduleName: "IDSFoundation",
  staticBase: "0x18f362000",
};

/**
 * Strip ARM64 PAC from address
 */
function stripPAC(addr) {
  if (Process.arch !== "arm64") return addr;

  let stripped = addr.and(ptr("0x7FFFFFFFFF"));
  if (Process.findModuleByAddress(stripped)) return stripped;

  // Fallback mask
  stripped = addr.and(ptr("0xFFFFFFFFFF"));
  if (Process.findModuleByAddress(stripped)) {
    return stripped;
  }

  return addr;
}

/**
 * Map Objective-C method to static address
 * @param {string} className - Class name
 * @param {string} methodName - Method name (include colons)
 * @param {boolean} isInstance - true for instance (-), false for class (+)
 */
function map(className, methodName, isInstance = true) {
  const prefix = isInstance ? "-" : "+";
  const pattern = `${prefix}[${className} ${methodName}]`;

  console.log(`\nMapping ${pattern}`);

  try {
    const matches = new ApiResolver("objc").enumerateMatches(pattern);
    if (!matches.length) {
      console.log("Method not found");
      const oppositePrefix = isInstance ? "+" : "-";
      const oppositePattern = `${oppositePrefix}[${className} ${methodName}]`;
      const oppositeMatches = new ApiResolver("objc").enumerateMatches(
        oppositePattern,
      );
      if (oppositeMatches.length) {
        console.log(`Hint: Found ${oppositePattern} instead`);
        console.log(
          `Try: map("${className}", "${methodName}", ${!isInstance})`,
        );
      }
      return null;
    }

    // Get implementation address
    const imp = stripPAC(ptr(matches[0].address));
    const module = Process.findModuleByAddress(imp);

    if (!module) {
      console.log("Implementation not in any module");
      return null;
    }

    // Calculate offset and static address
    const offset = imp.sub(module.base);
    const isTargetModule = module.name === config.moduleName;
    const staticAddr = isTargetModule
      ? ptr(config.staticBase).add(offset)
      : null;

    // Verify it's valid code
    let instruction = "unknown";
    try {
      instruction = Instruction.parse(imp).toString();
    } catch (e) {
      instruction = `Invalid: ${e.message}`;
    }

    console.log(`Runtime address:     ${imp}`);
    console.log(`Module:              ${module.name} (base: ${module.base})`);
    console.log(`Offset from base:    0x${offset.toString(16)}`);

    if (staticAddr) {
      console.log(`Static analysis:     ${staticAddr}`);
    } else {
      console.log(
        `Static analysis:     [${module.name} base] + 0x${offset.toString(16)}`,
      );
      console.log(
        `Note: Update config for ${module.name} to get absolute address`,
      );
    }

    return {
      runtimeAddress: imp.toString(),
      moduleName: module.name,
      moduleBase: module.base.toString(),
      offsetFromBase: "0x" + offset.toString(16),
      staticAddress: staticAddr?.toString() || null,
    };
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

/**
 * Search for methods
 */
function find(classPattern, methodPattern = "*") {
  console.log(`\nSearching *[${classPattern} ${methodPattern}]`);

  const results = [];
  for (const prefix of ["+", "-"]) {
    try {
      const pattern = `${prefix}[${classPattern} ${methodPattern}]`;
      results.push(...new ApiResolver("objc").enumerateMatches(pattern));
    } catch (e) {}
  }

  console.log(`\nFound ${results.length} methods:`);
  results.slice(0, 20).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.name}`);
  });

  if (results.length > 20) {
    console.log(`   ... and ${results.length - 20} more`);
  }

  return results;
}

/**
 * Update configuration
 */
function setConfig(moduleName, staticBase) {
  if (!Process.findModuleByName(moduleName)) {
    console.log(`Module '${moduleName}' not found`);
    return false;
  }

  config.moduleName = moduleName;
  config.staticBase = staticBase;
  console.log(`Config updated: ${moduleName} @ ${staticBase}`);
  return true;
}

/**
 * Show loaded modules
 */
function modules() {
  console.log("\nLoaded modules:");
  Process.enumerateModules()
    .slice(0, 15)
    .forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.name} @ ${m.base}`);
    });
}

console.log("\nObjective-C Method Address Mapper");
console.log("Commands:");
console.log(
  '   map("Class", "method:", true)      // Map method (true=instance, false=class)',
);
console.log('   find("Class*", "method*")          // Search methods');
console.log('   setConfig("Module", "0xBase")      // Update config');
console.log("   modules()                         // List modules");

const targetModule = Process.findModuleByName(config.moduleName);
if (targetModule) {
  console.log(`\nFound ${config.moduleName} @ ${targetModule.base}`);
} else {
  console.log(`\nTip: Run setConfig("YourModule", "0xYourStaticBase")`);
}
