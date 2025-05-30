const MIN_PTR = ptr("0x100000000");
const ISA_CLASS_MASK = ptr("0x0000000ffffffff8"); // Process.getModuleByName("libobjc.A.dylib").getExportByName("objc_debug_isa_class_mask").readPointer()
const ISA_MAGIC_MASK = ptr("0x000003f000000001");
const ISA_MAGIC_VALUE = ptr("0x000001a000000001");
const TAGGEDPOINTER_MASK = ptr("0x8000000000000000"); // Process.getModuleByName("libobjc.A.dylib").getExportByName("objc_debug_taggedpointer_mask").readPointer()

/**
 * Check if address is a tagged pointer
 * Data held by a tagged pointer is encoded entirely into the pointer value itself - no heap allocation occurs.
 * @param {NativePointer} address - The address to check
 * @returns {boolean} True if the address is a tagged pointer
 */
function isTaggedPointer(address) {
  // TODO: There is a problem with this implementation.
  // All tagged pointers have odd addresses but not all odd addresses are valid tagged pointers.
  // This leads to false positives and crashes if ObjC.Object(...) is called with an invalid odd address.
  return address.and(1).equals(1);
}

/**
 * Performs basic address validation (null check, tagged pointer check, minimum address)
 * @param {NativePointer} address - The address to check
 * @returns {boolean} True if the address could be valid
 */
function isValidPointerAddress(address) {
  if (address.isNull()) return false;

  if (isTaggedPointer(address)) return true;

  return address.compare(MIN_PTR) >= 0;
}

/**
 * Check if memory at address is readable using Memory.queryProtection and address.readU8
 * @param {NativePointer} address - The memory address to check
 * @returns {boolean} True if the memory is readable
 */
function isAddressReadable(address) {
  if (!isValidPointerAddress(address)) return false;

  try {
    const protection = Memory.queryProtection(address);
    if (protection && protection.includes("r")) {
      address.readU8(); // Attempt to read a byte
      return true;
    }
  } catch (e) {
    return false;
  }

  return false;
}

/**
 * Batch validation for multiple addresses against readable memory ranges
 * @param {NativePointer[]} addresses - Array of addresses to validate
 * @returns {Map<string, boolean>} Map of address string -> validity boolean
 */
function areAddressesReadable(addresses) {
  const results = new Map();
  const readableRanges = Process.enumerateRanges("r--");

  for (const address of addresses) {
    if (!isValidPointerAddress(address)) {
      results.set(address.toString(), false);
      continue;
    }

    const isInReadableRange = readableRanges.some(
      (range) =>
        address.compare(range.base) >= 0 &&
        address.compare(range.base.add(range.size)) < 0,
    );

    results.set(address.toString(), isInReadableRange);
  }

  return results;
}

/**
 * Extract the class pointer from an iOS Objective-C object's isa field
 * @param {NativePointer} objectAddress - The address of the ObjC object
 * @returns {NativePointer} The class pointer or NULL if invalid
 */
function extractObjCClassPointer(objectAddress) {
  if (!isValidPointerAddress(objectAddress)) return NULL;

  if (isTaggedPointer(objectAddress)) return NULL; // Tagged pointers don't have traditional class pointers

  if (!isAddressReadable(objectAddress)) return NULL;

  try {
    const isa = objectAddress.readPointer();
    const classPointer = isa.and(ISA_CLASS_MASK);

    if (
      !isa.and(ISA_MAGIC_MASK).equals(ISA_MAGIC_VALUE) ||
      !isValidPointerAddress(classPointer) ||
      !isAddressReadable(classPointer)
    ) {
      return NULL;
    }

    return classPointer;
  } catch (e) {
    return NULL;
  }
}

/**
 * Validate if address points to a safe to read Objective-C object
 * @param {NativePointer} address - The address to check
 * @returns {boolean} True if the address points to a valid Objective-C object
 */
function isSafeToReadObjCObject(address) {
  if (!isValidPointerAddress(address)) return false;

  // if (isTaggedPointer(address)) return true; // Not safe for now -> could lead to crashes

  const classPointer = extractObjCClassPointer(address);
  if (classPointer.isNull()) return false;

  try {
    const classNamePointer = ObjC.api.class_getName(classPointer);
    if (classNamePointer.isNull()) return false;

    const className = classNamePointer.readCString();
    return className && className.length > 0 && className.length < 100;
  } catch (e) {
    return false;
  }
}

/**
 * Safely create an Objective-C object from a pointer
 * @param {NativePointer} pointer - The pointer to the ObjC object
 * @returns {Object} The Objective-C object
 * @throws {Error} If the pointer doesn't point to a valid ObjC object
 */
function readObjectSafe(pointer) {
  if (!isSafeToReadObjCObject(pointer)) {
    throw new Error(`Invalid ObjC object at ${pointer}`);
  }

  try {
    const objcObject = ObjC.Object(pointer);
    objcObject.class(); // Quick validation by accessing class
    return objcObject;
  } catch (e) {
    throw new Error(`Failed to create ObjC object: ${e.message}`);
  }
}
