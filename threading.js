var QOS_CLASS_USER_INTERACTIVE = 0x21;
var QOS_CLASS_USER_INITIATED = 0x19;
var QOS_CLASS_DEFAULT = 0x15;
var QOS_CLASS_UTILITY = 0x11;
var QOS_CLASS_BACKGROUND = 0x09;
var QOS_CLASS_MAINTENANCE = 0x05;
var QOS_CLASS_UNSPECIFIED = 0x00;

var dispatch_get_global_queue = new NativeFunction(
  Process.getModuleByName("libdispatch.dylib").getExportByName(
    "dispatch_get_global_queue",
  ),
  "pointer",
  ["int", "int"],
);

var mainQueue = ObjC.mainQueue;

/**
 * Runs a method on a specific dispatch queue.
 * @param {pointer} queue - The target dispatch queue to run the method on
 * @param {Function} method - The method to execute on the queue
 * @returns {Promise} Promise that resolves to the result of the method
 */
function runOnQueue(queue, method) {
    return new Promise((resolve, reject) => {
        function run() {
            try {
                resolve(method());
            } catch (e) {
                reject(e);
            }
        }
        if (queue.equals(ObjC.mainQueue) && ObjC.classes.NSThread.isMainThread()) {
            run();
        } else {
            ObjC.schedule(queue, run);
        }
    });
}

/**
 * Runs a method on a specific thread.
 * @param {NSThread} thread - The target NSThread object
 * @param {Function} method - Method to call
 * @param {number} timeout - Optional timeout in milliseconds (default: 5000)
 * @returns {Promise} Promise that resolves to the result of the method
 */
function runOnThread(thread, method, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!thread || thread.isNull()) {
      reject(new Error("Invalid or null thread object"));
      return;
    }

    if (thread.isCancelled() || thread.isFinished()) {
      reject(new Error("Thread is cancelled or finished"));
      return;
    }

    const currentThread = ObjC.classes.NSThread.currentThread();

    if (currentThread.isEqual_(thread)) {
      try {
        const result = method();
        resolve(result);
      } catch (e) {
        reject(e);
      }
      return;
    }

    let timeoutId;
    let hasResolved = false;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          reject(new Error(`Thread execution timeout after ${timeout}ms`));
        }
      }, timeout);
    }

    function safeResolve(value) {
      if (!hasResolved) {
        hasResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      }
    }

    function safeReject(error) {
      if (!hasResolved) {
        hasResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      }
    }

    try {
      const runLoop = thread.runLoop();
      if (!runLoop || runLoop.isNull()) {
        if (thread.isMainThread()) {
          safeReject(
            new Error("Main thread should have a run loop but none found"),
          );
          return;
        } else {
          safeReject(
            new Error(
              "Thread has no run loop - background threads need explicit run loop setup",
            ),
          );
          return;
        }
      }

      const block = new ObjC.Block({
        retType: "void",
        argTypes: [],
        implementation: function () {
          try {
            const result = method();
            safeResolve(result);
          } catch (e) {
            safeReject(e);
          }
        },
      });

      runLoop.performBlock_(block);
    } catch (e) {
      safeReject(new Error(`Failed to schedule block on thread: ${e.message}`));
    }
  });
}

const mainThread = ObjC.classes.NSThread.mainThread();

function findBackgroundThreads() {
  const threads = ObjC.chooseSync(ObjC.classes.NSThread);
  const backgroundThreads = threads.filter((thread) => {
    try {
      return (
        !thread.isMainThread() &&
        !thread.isCancelled() &&
        !thread.isFinished() &&
        thread.runLoop() &&
        !thread.runLoop().isNull()
      );
    } catch (e) {
      return false;
    }
  });
  return backgroundThreads;
}

function getThreadByName(name) {
  const threads = ObjC.chooseSync(ObjC.classes.NSThread);
  return threads.find((thread) => thread.name() === name);
}
