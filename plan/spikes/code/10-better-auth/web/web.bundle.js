// node_modules/better-auth/dist/package.mjs
var version = "1.7.6";

// node_modules/better-auth/dist/version.mjs
var PACKAGE_VERSION = version;

// node_modules/better-auth/dist/client/broadcast-channel.mjs
var kBroadcastChannel = Symbol.for("better-auth:broadcast-channel");
var now = () => Math.floor(Date.now() / 1e3);
var WindowBroadcastChannel = class {
  listeners = /* @__PURE__ */ new Set();
  name;
  constructor(name = "better-auth.message") {
    this.name = name;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  post(message) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.name, JSON.stringify({
        ...message,
        timestamp: now()
      }));
    } catch {
    }
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const handler = (event) => {
      if (event.key !== this.name) return;
      const message = JSON.parse(event.newValue ?? "{}");
      if (message?.event !== "session" || !message?.data) return;
      this.listeners.forEach((listener) => listener(message));
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }
};
function getGlobalBroadcastChannel(name = "better-auth.message") {
  if (!globalThis[kBroadcastChannel]) globalThis[kBroadcastChannel] = new WindowBroadcastChannel(name);
  return globalThis[kBroadcastChannel];
}

// node_modules/nanostores/clean-stores/index.js
var clean = Symbol("clean");

// node_modules/nanostores/atom/index.js
var listenerQueue = [];
var lqIndex = 0;
var batchSeen = null;
var QUEUE_ITEMS_PER_LISTENER = 4;
var nanostoresGlobal = globalThis.nanostoresGlobal ||= { epoch: 0 };
var drainQueue = () => {
  let thrown;
  let i;
  while (lqIndex < listenerQueue.length) {
    i = lqIndex;
    lqIndex += QUEUE_ITEMS_PER_LISTENER;
    let pendingStores = batchSeen?.get(listenerQueue[i]);
    if (pendingStores) {
      if (!pendingStores.has(listenerQueue[i + 1])) continue;
      pendingStores.clear();
    }
    try {
      listenerQueue[i](
        listenerQueue[i + 1].value,
        listenerQueue[i + 2],
        listenerQueue[i + 3]
      );
    } catch (e) {
      thrown = e;
    }
  }
  listenerQueue.length = lqIndex = 0;
  if (thrown) throw thrown;
};
var atom = /* @__NO_SIDE_EFFECTS__ */ (initialValue) => {
  let listeners = [];
  let $atom = {
    eq: Object.is,
    get() {
      if (!$atom.lc) {
        $atom.listen(() => {
        })();
      }
      return $atom.value;
    },
    init: initialValue,
    lc: 0,
    listen(listener) {
      $atom.lc = listeners.push(listener);
      return () => {
        batchSeen?.get(listener)?.delete($atom);
        for (let i = lqIndex; i < listenerQueue.length; ) {
          if (listenerQueue[i] === listener && listenerQueue[i + 1] === $atom) {
            listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
          } else {
            i += QUEUE_ITEMS_PER_LISTENER;
          }
        }
        let index = listeners.indexOf(listener);
        if (~index) {
          listeners.splice(index, 1);
          if (!--$atom.lc) $atom.off();
        }
      };
    },
    notify(oldValue, changedKey) {
      nanostoresGlobal.epoch++;
      let runListenerQueue = !listenerQueue.length && !batchSeen;
      for (let listener of listeners) {
        if (batchSeen) {
          let pendingStores = batchSeen.get(listener);
          if (!pendingStores) batchSeen.set(listener, pendingStores = /* @__PURE__ */ new Set());
          if (pendingStores.has($atom)) continue;
          pendingStores.add($atom);
        }
        listenerQueue.push(
          listener,
          $atom,
          oldValue,
          batchSeen ? void 0 : changedKey
        );
      }
      if (runListenerQueue) {
        drainQueue();
      }
    },
    /* It will be called on last listener unsubscribing.
       We will redefine it in onMount and onStop. */
    off() {
    },
    set(newValue) {
      let oldValue = $atom.value;
      if (!$atom.eq(oldValue, newValue)) {
        $atom.value = newValue;
        $atom.notify(oldValue);
      }
    },
    subscribe(listener) {
      let unbind = $atom.listen(listener);
      listener($atom.value);
      return unbind;
    },
    value: initialValue
  };
  if (true) {
    $atom[clean] = () => {
      listeners = [];
      $atom.lc = 0;
      $atom.off();
    };
  }
  return $atom;
};

// node_modules/nanostores/lifecycle/index.js
var SET = 2;
var MOUNT = 5;
var UNMOUNT = 6;
var REVERT_MUTATION = 10;
var on = (object, listener, eventKey, mutateStore) => {
  object.events = object.events || {};
  if (!object.events[eventKey + REVERT_MUTATION]) {
    object.events[eventKey + REVERT_MUTATION] = mutateStore((eventProps) => {
      object.events[eventKey].reduceRight((event, l) => (l(event), event), {
        shared: {},
        ...eventProps
      });
    });
  }
  object.events[eventKey] = object.events[eventKey] || [];
  object.events[eventKey].push(listener);
  return () => {
    let currentListeners = object.events[eventKey];
    let index = currentListeners.indexOf(listener);
    if (~index) {
      currentListeners.splice(index, 1);
      if (!currentListeners.length) {
        object.events[eventKey + REVERT_MUTATION]();
        delete object.events[eventKey + REVERT_MUTATION];
      }
    }
  };
};
var onSet = ($store, listener) => on($store, listener, SET, (runListeners) => {
  let originSet = $store.set;
  let originSetKey = $store.setKey;
  if ($store.setKey) {
    $store.setKey = (changed, changedValue) => {
      let isAborted;
      let abort = () => {
        isAborted = true;
      };
      runListeners({
        abort,
        changed,
        newValue: { ...$store.value, [changed]: changedValue }
      });
      if (!isAborted) return originSetKey(changed, changedValue);
    };
  }
  $store.set = (newValue) => {
    let isAborted;
    let abort = () => {
      isAborted = true;
    };
    runListeners({ abort, newValue });
    if (!isAborted) return originSet(newValue);
  };
  return () => {
    $store.set = originSet;
    $store.setKey = originSetKey;
  };
});
var STORE_UNMOUNT_DELAY = 1e3;
var onMount = ($store, initialize) => {
  let listener = (payload) => {
    let destroy = initialize(payload);
    if (destroy) $store.events[UNMOUNT].push(destroy);
  };
  return on($store, listener, MOUNT, (runListeners) => {
    let originListen = $store.listen;
    $store.listen = (...args) => {
      if (!$store.lc && !$store.active) {
        $store.active = true;
        runListeners();
      }
      return originListen(...args);
    };
    let originOff = $store.off;
    $store.events[UNMOUNT] = [];
    $store.off = () => {
      originOff();
      setTimeout(() => {
        if ($store.active && !$store.lc) {
          $store.active = false;
          for (let destroy of $store.events[UNMOUNT]) destroy();
          $store.events[UNMOUNT] = [];
        }
      }, STORE_UNMOUNT_DELAY);
    };
    if (true) {
      let originClean = $store[clean];
      $store[clean] = () => {
        for (let destroy of $store.events[UNMOUNT]) destroy();
        $store.events[UNMOUNT] = [];
        $store.active = false;
        originClean();
      };
    }
    return () => {
      $store.listen = originListen;
      $store.off = originOff;
    };
  });
};

// node_modules/better-auth/dist/client/equality.mjs
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isJsonEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!isJsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) if (!(key in b) || !isJsonEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}
function withEquality(store, isEqual) {
  return onSet(store, ({ newValue, abort }) => {
    if (isEqual(store.value, newValue)) abort();
  });
}

// node_modules/better-auth/dist/client/focus-manager.mjs
var kFocusManager = Symbol.for("better-auth:focus-manager");
var WindowFocusManager = class {
  listeners = /* @__PURE__ */ new Set();
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setFocused(focused) {
    this.listeners.forEach((listener) => listener(focused));
  }
  setup() {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") this.setFocused(true);
    };
    document.addEventListener("visibilitychange", visibilityHandler, false);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler, false);
    };
  }
};
function getGlobalFocusManager() {
  if (!globalThis[kFocusManager]) globalThis[kFocusManager] = new WindowFocusManager();
  return globalThis[kFocusManager];
}

// node_modules/better-auth/dist/client/online-manager.mjs
var kOnlineManager = Symbol.for("better-auth:online-manager");
var WindowOnlineManager = class {
  listeners = /* @__PURE__ */ new Set();
  isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setOnline(online) {
    this.isOnline = online;
    this.listeners.forEach((listener) => listener(online));
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);
    window.addEventListener("online", onOnline, false);
    window.addEventListener("offline", onOffline, false);
    return () => {
      window.removeEventListener("online", onOnline, false);
      window.removeEventListener("offline", onOffline, false);
    };
  }
};
function getGlobalOnlineManager() {
  if (!globalThis[kOnlineManager]) globalThis[kOnlineManager] = new WindowOnlineManager();
  return globalThis[kOnlineManager];
}

// node_modules/better-auth/dist/client/parser.mjs
var PROTO_POLLUTION_PATTERNS = {
  proto: /"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/,
  constructor: /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/,
  protoShort: /"__proto__"\s*:/,
  constructorShort: /"constructor"\s*:/
};
var JSON_SIGNATURE = /^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;
var SPECIAL_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: void 0,
  nan: NaN,
  infinity: Number.POSITIVE_INFINITY,
  "-infinity": Number.NEGATIVE_INFINITY
};
var ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}
function parseISODate(value) {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, ms, offsetSign, offsetHour, offsetMinute] = match;
  const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10), ms ? parseInt(ms.padEnd(3, "0"), 10) : 0));
  if (offsetSign) {
    const offset = (parseInt(offsetHour, 10) * 60 + parseInt(offsetMinute, 10)) * (offsetSign === "+" ? -1 : 1);
    date.setUTCMinutes(date.getUTCMinutes() + offset);
  }
  return isValidDate(date) ? date : null;
}
function betterJSONParse(value, options = {}) {
  const { strict = false, warnings = false, reviver, parseDates = true } = options;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const lowerValue = trimmed.toLowerCase();
  if (lowerValue.length <= 9 && lowerValue in SPECIAL_VALUES) return SPECIAL_VALUES[lowerValue];
  if (!JSON_SIGNATURE.test(trimmed)) {
    if (strict) throw new SyntaxError("[better-json] Invalid JSON");
    return value;
  }
  if (Object.entries(PROTO_POLLUTION_PATTERNS).some(([key, pattern]) => {
    const matches = pattern.test(trimmed);
    if (matches && warnings) console.warn(`[better-json] Detected potential prototype pollution attempt using ${key} pattern`);
    return matches;
  }) && strict) throw new Error("[better-json] Potential prototype pollution attempt detected");
  try {
    const secureReviver = (key, value2) => {
      if (key === "__proto__" || key === "constructor" && value2 && typeof value2 === "object" && "prototype" in value2) {
        if (warnings) console.warn(`[better-json] Dropping "${key}" key to prevent prototype pollution`);
        return;
      }
      if (parseDates && typeof value2 === "string") {
        const date = parseISODate(value2);
        if (date) return date;
      }
      return reviver ? reviver(key, value2) : value2;
    };
    return JSON.parse(trimmed, secureReviver);
  } catch (error) {
    if (strict) throw error;
    return value;
  }
}
function parseJSON(value, options = { strict: true }) {
  return betterJSONParse(value, options);
}

// node_modules/better-auth/dist/client/query-atom.mjs
var kAuthQuery = Symbol.for("better-auth:auth-query");
function createAuthQueryAtom(initialValue) {
  const queryAtom = atom(initialValue);
  Object.defineProperty(queryAtom, kAuthQuery, { value: true });
  return queryAtom;
}

// node_modules/better-auth/dist/client/query.mjs
var isServer = () => typeof window === "undefined";
function isAuthQueryStateEqual(a, b) {
  return isJsonEqual(a.data, b.data) && a.error === b.error && a.isPending === b.isPending && a.isRefetching === b.isRefetching && a.refetch === b.refetch;
}
var useAuthQuery = (initializedAtom, path, $fetch, options) => {
  const value = createAuthQueryAtom({
    data: null,
    error: null,
    isPending: true,
    isRefetching: false,
    refetch: (queryParams) => fn(queryParams)
  });
  onMount(value, () => withEquality(value, isAuthQueryStateEqual));
  let latestRequestId = 0;
  const fn = async (queryParams) => {
    const requestId = ++latestRequestId;
    return new Promise((resolve) => {
      const opts = typeof options === "function" ? options({
        data: value.get().data,
        error: value.get().error,
        isPending: value.get().isPending
      }) : options;
      $fetch(path, {
        ...opts,
        query: {
          ...opts?.query,
          ...queryParams?.query
        },
        async onSuccess(context) {
          if (requestId === latestRequestId) {
            const current = value.get();
            const stableData = current.data != null && context.data != null && isJsonEqual(current.data, context.data) ? current.data : context.data;
            value.set({
              data: stableData,
              error: null,
              isPending: false,
              isRefetching: false,
              refetch: value.value.refetch
            });
          }
          await opts?.onSuccess?.(context);
        },
        async onError(context) {
          const { request } = context;
          const retryAttempts = typeof request.retry === "number" ? request.retry : request.retry?.attempts;
          const retryAttempt = request.retryAttempt || 0;
          if (retryAttempts && retryAttempt < retryAttempts) return;
          if (requestId === latestRequestId) {
            const isUnauthorized = context.error.status === 401;
            value.set({
              error: context.error,
              data: isUnauthorized ? null : value.get().data,
              isPending: false,
              isRefetching: false,
              refetch: value.value.refetch
            });
          }
          await opts?.onError?.(context);
        },
        async onRequest(context) {
          if (requestId === latestRequestId) {
            const currentValue = value.get();
            value.set({
              isPending: currentValue.data === null,
              data: currentValue.data,
              error: null,
              isRefetching: true,
              refetch: value.value.refetch
            });
          }
          await opts?.onRequest?.(context);
        }
      }).catch((error) => {
        if (requestId !== latestRequestId) return;
        value.set({
          error,
          data: value.get().data,
          isPending: false,
          isRefetching: false,
          refetch: value.value.refetch
        });
      }).finally(() => {
        resolve(void 0);
      });
    });
  };
  initializedAtom = Array.isArray(initializedAtom) ? initializedAtom : [initializedAtom];
  let isMountFetchPending = false;
  let isMounted = false;
  let shouldRefetchAfterPending = false;
  const fetchOnMount = () => {
    if (isMountFetchPending) {
      shouldRefetchAfterPending = true;
      return;
    }
    isMountFetchPending = true;
    fn().finally(() => {
      isMountFetchPending = false;
      const shouldRefetch = shouldRefetchAfterPending && isMounted;
      shouldRefetchAfterPending = false;
      if (shouldRefetch) fetchOnMount();
    });
  };
  onMount(value, () => {
    if (isServer()) return;
    isMounted = true;
    let isInitialized = false;
    let timeoutId;
    const cleanups = initializedAtom.map((initAtom) => initAtom.listen(() => {
      if (isInitialized) fn();
      else {
        isInitialized = true;
        clearTimeout(timeoutId);
        fetchOnMount();
      }
    }));
    timeoutId = setTimeout(() => {
      isInitialized = true;
      fetchOnMount();
    }, 0);
    return () => {
      isMounted = false;
      for (const cleanup of cleanups) cleanup();
      clearTimeout(timeoutId);
    };
  });
  return value;
};

// node_modules/better-auth/dist/client/session-refresh.mjs
var now2 = () => Math.floor(Date.now() / 1e3);
var FOCUS_REFETCH_RATE_LIMIT_SECONDS = 5;
function createSessionRefreshManager(opts) {
  const { fetchSession, shouldPollSession = () => true, sessionSignal, options = {} } = opts;
  const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
  const refetchOnWindowFocus = options.sessionOptions?.refetchOnWindowFocus ?? true;
  const refetchWhenOffline = options.sessionOptions?.refetchWhenOffline ?? false;
  const state = {
    isInitialized: false,
    lastSessionRequest: 0
  };
  const shouldRefetch = () => {
    return refetchWhenOffline || getGlobalOnlineManager().isOnline;
  };
  const triggerRefetch = (event) => {
    if (!shouldRefetch()) return;
    if (event?.event === "storage") {
      fetchSession();
      return;
    }
    if (event?.event === "poll") {
      state.lastSessionRequest = now2();
      fetchSession();
      return;
    }
    if (event?.event === "visibilitychange") {
      if (now2() - state.lastSessionRequest < FOCUS_REFETCH_RATE_LIMIT_SECONDS) return;
      state.lastSessionRequest = now2();
      fetchSession();
      return;
    }
    fetchSession();
  };
  const broadcastSessionUpdate = (trigger) => {
    getGlobalBroadcastChannel().post({
      event: "session",
      data: { trigger },
      clientId: Math.random().toString(36).substring(7)
    });
  };
  const setupPolling = () => {
    if (refetchInterval && refetchInterval > 0) state.pollInterval = setInterval(() => {
      if (shouldPollSession()) triggerRefetch({ event: "poll" });
    }, refetchInterval * 1e3);
  };
  const setupBroadcast = () => {
    state.unsubscribeBroadcast = getGlobalBroadcastChannel().subscribe(() => {
      triggerRefetch({ event: "storage" });
    });
  };
  const setupFocusRefetch = () => {
    if (!refetchOnWindowFocus) return;
    state.unsubscribeFocus = getGlobalFocusManager().subscribe(() => {
      triggerRefetch({ event: "visibilitychange" });
    });
  };
  const setupOnlineRefetch = () => {
    state.unsubscribeOnline = getGlobalOnlineManager().subscribe((online) => {
      if (online) triggerRefetch({ event: "visibilitychange" });
    });
  };
  const setupSignalSubscription = () => {
    state.unsubscribeSignal = sessionSignal.listen(() => {
      fetchSession();
    });
  };
  const init = () => {
    if (state.isInitialized) return;
    state.isInitialized = true;
    setupPolling();
    setupBroadcast();
    setupFocusRefetch();
    setupOnlineRefetch();
    setupSignalSubscription();
    state.cleanupBroadcastSetup = getGlobalBroadcastChannel().setup();
    state.cleanupFocusSetup = getGlobalFocusManager().setup();
    state.cleanupOnlineSetup = getGlobalOnlineManager().setup();
  };
  const cleanup = () => {
    if (!state.isInitialized) return;
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = void 0;
    }
    if (state.unsubscribeBroadcast) {
      state.unsubscribeBroadcast();
      state.unsubscribeBroadcast = void 0;
    }
    if (state.unsubscribeFocus) {
      state.unsubscribeFocus();
      state.unsubscribeFocus = void 0;
    }
    if (state.unsubscribeOnline) {
      state.unsubscribeOnline();
      state.unsubscribeOnline = void 0;
    }
    if (state.unsubscribeSignal) {
      state.unsubscribeSignal();
      state.unsubscribeSignal = void 0;
    }
    if (state.cleanupBroadcastSetup) {
      state.cleanupBroadcastSetup();
      state.cleanupBroadcastSetup = void 0;
    }
    if (state.cleanupFocusSetup) {
      state.cleanupFocusSetup();
      state.cleanupFocusSetup = void 0;
    }
    if (state.cleanupOnlineSetup) {
      state.cleanupOnlineSetup();
      state.cleanupOnlineSetup = void 0;
    }
    state.isInitialized = false;
    state.lastSessionRequest = 0;
  };
  return {
    init,
    cleanup,
    triggerRefetch,
    broadcastSessionUpdate
  };
}

// node_modules/@better-auth/core/dist/env/env-impl.mjs
var _envShim = /* @__PURE__ */ Object.create(null);
var _getEnv = (useShim) => globalThis.process?.env || globalThis.Deno?.env.toObject() || globalThis.__env__ || (useShim ? _envShim : globalThis);
var env = new Proxy(_envShim, {
  get(_, prop) {
    return _getEnv()[prop] ?? _envShim[prop];
  },
  has(_, prop) {
    return prop in _getEnv() || prop in _envShim;
  },
  set(_, prop, value) {
    const env2 = _getEnv(true);
    env2[prop] = value;
    return true;
  },
  deleteProperty(_, prop) {
    if (!prop) return false;
    const env2 = _getEnv(true);
    delete env2[prop];
    return true;
  },
  ownKeys() {
    const env2 = _getEnv(true);
    return Object.keys(env2);
  }
});
var nodeENV = env.NODE_ENV ?? "";
function getEnvVar(key, fallback) {
  if (typeof process !== "undefined" && process.env) return process.env[key] ?? fallback;
  if (typeof Deno !== "undefined") return Deno.env.get(key) ?? fallback;
  if (typeof Bun !== "undefined") return Bun.env[key] ?? fallback;
  return fallback;
}
var ENV = Object.freeze({
  get BETTER_AUTH_SECRET() {
    return getEnvVar("BETTER_AUTH_SECRET");
  },
  get AUTH_SECRET() {
    return getEnvVar("AUTH_SECRET");
  },
  get BETTER_AUTH_TELEMETRY() {
    return getEnvVar("BETTER_AUTH_TELEMETRY");
  },
  get BETTER_AUTH_TELEMETRY_ID() {
    return getEnvVar("BETTER_AUTH_TELEMETRY_ID");
  },
  get NODE_ENV() {
    return getEnvVar("NODE_ENV", "development");
  },
  get PACKAGE_VERSION() {
    return getEnvVar("PACKAGE_VERSION", "0.0.0");
  },
  get BETTER_AUTH_TELEMETRY_ENDPOINT() {
    return getEnvVar("BETTER_AUTH_TELEMETRY_ENDPOINT", "");
  }
});

// node_modules/@better-auth/core/dist/utils/error-codes.mjs
function defineErrorCodes(codes) {
  return Object.fromEntries(Object.entries(codes).map(([key, value]) => [key, {
    code: key,
    message: value,
    toString: () => key
  }]));
}

// node_modules/better-call/dist/error.mjs
function isErrorStackTraceLimitWritable() {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === void 0) return Object.isExtensible(Error);
  return Object.prototype.hasOwnProperty.call(desc, "writable") ? desc.writable : desc.set !== void 0;
}
function hideInternalStackFrames(stack) {
  const lines = stack.split("\n    at ");
  if (lines.length <= 1) return stack;
  lines.splice(1, 1);
  return lines.join("\n    at ");
}
function makeErrorForHideStackFrame(Base, clazz) {
  class HideStackFramesError extends Base {
    #hiddenStack;
    constructor(...args) {
      if (isErrorStackTraceLimitWritable()) {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 0;
        super(...args);
        Error.stackTraceLimit = limit;
      } else super(...args);
      const stack = (/* @__PURE__ */ new Error()).stack;
      if (stack) this.#hiddenStack = hideInternalStackFrames(stack.replace(/^Error/, this.name));
    }
    get errorStack() {
      return this.#hiddenStack;
    }
  }
  Object.defineProperty(HideStackFramesError.prototype, "constructor", {
    get() {
      return clazz;
    },
    enumerable: false,
    configurable: true
  });
  return HideStackFramesError;
}
var statusCodes = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  "I'M_A_TEAPOT": 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};
var InternalAPIError = class extends Error {
  status;
  body;
  headers;
  statusCode;
  constructor(status = "INTERNAL_SERVER_ERROR", body = void 0, headers = {}, statusCode = typeof status === "number" ? status : statusCodes[status]) {
    super(body?.message, body?.cause ? { cause: body.cause } : void 0);
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.statusCode = statusCode;
    this.name = "APIError";
    this.status = status;
    this.headers = headers;
    this.statusCode = statusCode;
    this.body = body;
  }
};
var kAPIErrorHeaderSymbol = Symbol.for("better-call:api-error-headers");
var APIError = makeErrorForHideStackFrame(InternalAPIError, Error);

// node_modules/@better-auth/core/dist/error/index.mjs
var BetterAuthError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "BetterAuthError";
    this.message = message;
    this.stack = "";
  }
};

// node_modules/better-auth/dist/utils/url.mjs
var SLASH_CHAR_CODE = "/".charCodeAt(0);
function trimTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) end--;
  return end === value.length ? value : value.slice(0, end);
}
function checkHasPath(url) {
  try {
    return (trimTrailingSlashes(new URL(url).pathname) || "/") !== "/";
  } catch {
    throw new BetterAuthError(`Invalid base URL: ${url}. Please provide a valid base URL.`);
  }
}
function assertHasProtocol(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new BetterAuthError(`Invalid base URL: ${url}. URL must include 'http://' or 'https://'`);
  } catch (error) {
    if (error instanceof BetterAuthError) throw error;
    throw new BetterAuthError(`Invalid base URL: ${url}. Please provide a valid base URL.`, { cause: error });
  }
}
function withPath(url, path = "/api/auth") {
  assertHasProtocol(url);
  if (checkHasPath(url)) return url;
  const trimmedUrl = trimTrailingSlashes(url);
  if (!path || path === "/") return trimmedUrl;
  path = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedUrl}${path}`;
}
function validateProxyHeader(header, type) {
  if (!header || header.trim() === "") return false;
  if (type === "proto") return header === "http" || header === "https";
  if (type === "host") {
    if ([
      /\.\./,
      /\0/,
      /[\s]/,
      /^[.]/,
      /[<>'"]/,
      /javascript:/i,
      /file:/i,
      /data:/i
    ].some((pattern) => pattern.test(header))) return false;
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/.test(header) || /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(header) || /^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$/.test(header) || /^localhost(:[0-9]{1,5})?$/i.test(header);
  }
  return false;
}
function getBaseURL(url, path, request, loadEnv, trustedProxyHeaders) {
  if (url) return withPath(url, path);
  if (loadEnv !== false) {
    const fromEnv = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_BETTER_AUTH_URL || env.PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_AUTH_URL || (env.BASE_URL !== "/" ? env.BASE_URL : void 0);
    if (fromEnv) return withPath(fromEnv, path);
  }
  const fromRequest = request?.headers.get("x-forwarded-host");
  const fromRequestProto = request?.headers.get("x-forwarded-proto");
  if (fromRequest && fromRequestProto && trustedProxyHeaders) {
    if (validateProxyHeader(fromRequestProto, "proto") && validateProxyHeader(fromRequest, "host")) try {
      return withPath(`${fromRequestProto}://${fromRequest}`, path);
    } catch (_error) {
    }
  }
  if (request) {
    const url2 = getOrigin(request.url);
    if (!url2) throw new BetterAuthError("Could not get origin from request. Please provide a valid base URL.");
    return withPath(url2, path);
  }
  if (typeof window !== "undefined" && window.location) return withPath(window.location.origin, path);
}
function getOrigin(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin === "null" ? null : parsedUrl.origin;
  } catch {
    return null;
  }
}

// node_modules/@better-auth/core/dist/utils/url.mjs
var DANGEROUS_URL_SCHEMES = [
  "javascript:",
  "data:",
  "vbscript:"
];
function isSafeUrlScheme(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }
  return !DANGEROUS_URL_SCHEMES.includes(parsed.protocol);
}

// node_modules/better-auth/dist/client/fetch-plugins.mjs
var redirectPlugin = {
  id: "redirect",
  name: "Redirect",
  hooks: { onSuccess(context) {
    if (context.data?.url && context.data?.redirect && isSafeUrlScheme(context.data.url)) {
      if (typeof window !== "undefined" && window.location) {
        if (window.location) try {
          window.location.href = context.data.url;
        } catch {
        }
      }
    }
  } }
};

// node_modules/better-auth/dist/client/session-atom.mjs
var isServer2 = () => typeof window === "undefined";
var SESSION_MOUNT_DEDUPE_INTERVAL = STORE_UNMOUNT_DELAY;
function hydrateSessionAtom(sessionAtom, session) {
  if (typeof window === "undefined") return;
  const currentSession = sessionAtom.get();
  if (currentSession.data !== null || session === null) return;
  sessionAtom.set({
    ...currentSession,
    data: session,
    error: null,
    isPending: false
  });
}
function normalizeSessionResponse(res) {
  if (typeof res === "object" && res !== null && "data" in res && "error" in res) return res;
  return {
    data: res,
    error: null
  };
}
function normalizeSessionData(data) {
  if (!data) return null;
  if (data.session === null && data.user === null) return null;
  return data;
}
function isSessionAtomEqual(a, b) {
  return isJsonEqual(a.data, b.data) && a.error === b.error && a.isPending === b.isPending && a.isRefetching === b.isRefetching && a.refetch === b.refetch;
}
function getSessionAtom($fetch, options) {
  const $signal = atom(false);
  let flight;
  let freshUntil = 0;
  let sessionRevision = 0;
  $signal.listen(() => {
    sessionRevision++;
    freshUntil = 0;
  });
  const refetch = (queryParams) => fetchSession(queryParams);
  const session = createAuthQueryAtom({
    data: null,
    error: null,
    isPending: true,
    isRefetching: false,
    refetch
  });
  withEquality(session, isSessionAtomEqual);
  const executeSessionFetch = async (signal, queryParams) => {
    const current = session.value;
    session.set({
      ...current,
      isPending: current.data === null,
      isRefetching: true,
      error: null,
      refetch
    });
    if (signal.aborted) return "aborted";
    try {
      const res = await $fetch("/get-session", {
        method: "GET",
        query: queryParams?.query,
        signal
      });
      if (signal.aborted) return "aborted";
      let { data, error } = normalizeSessionResponse(res);
      let outcome = "fresh";
      if (data?.needsRefresh) try {
        const refreshRes = await $fetch("/get-session", {
          method: "POST",
          signal
        });
        if (signal.aborted) return "aborted";
        ({ data, error } = normalizeSessionResponse(refreshRes));
      } catch {
        if (signal.aborted) return "aborted";
        outcome = "stale";
      }
      if (error) {
        const latest = session.value;
        const isUnauthorized = error?.status === 401;
        session.set({
          data: isUnauthorized ? null : latest.data,
          error,
          isPending: false,
          isRefetching: false,
          refetch
        });
        return "failed";
      }
      const sessionData = normalizeSessionData(data);
      const current2 = session.value;
      const stableData = current2.data != null && sessionData != null && isJsonEqual(current2.data, sessionData) ? current2.data : sessionData;
      session.set({
        data: stableData,
        error: null,
        isPending: false,
        isRefetching: false,
        refetch
      });
      return outcome;
    } catch (fetchError) {
      if (signal.aborted) return "aborted";
      const latest = session.value;
      session.set({
        data: latest.data,
        error: fetchError,
        isPending: false,
        isRefetching: false,
        refetch
      });
      return "failed";
    }
  };
  const getFreshUntil = () => {
    const expiresAt = session.value.data?.session?.expiresAt;
    const sessionExpiresAt = expiresAt instanceof Date ? expiresAt.getTime() : Number.POSITIVE_INFINITY;
    return Math.min(Date.now() + SESSION_MOUNT_DEDUPE_INTERVAL, sessionExpiresAt);
  };
  const fetchSession = (queryParams) => {
    freshUntil = 0;
    flight?.cancel();
    const controller = new AbortController();
    const request = {
      cancel: () => controller.abort(),
      promise: Promise.resolve().then(() => {
        if (controller.signal.aborted) return "aborted";
        return executeSessionFetch(controller.signal, queryParams);
      }),
      revision: sessionRevision
    };
    flight = request;
    const settleFlight = (outcome) => {
      if (flight !== request) return;
      flight = void 0;
      if (outcome === "fresh" && request.revision === sessionRevision) freshUntil = getFreshUntil();
    };
    request.promise.then(settleFlight, () => settleFlight("failed"));
    return request.promise.then(() => void 0);
  };
  const fetchSessionOnMount = () => {
    if (flight?.revision === sessionRevision) return flight.promise.then(() => void 0);
    if (Date.now() < freshUntil) return Promise.resolve();
    return fetchSession();
  };
  let broadcastSessionUpdate = () => {
  };
  onMount(session, () => {
    let timeoutId;
    if (!isServer2()) timeoutId = setTimeout(() => {
      fetchSessionOnMount();
    }, 0);
    const refreshManager = createSessionRefreshManager({
      fetchSession,
      shouldPollSession: () => session.value.data != null,
      sessionSignal: $signal,
      options
    });
    refreshManager.init();
    broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      refreshManager.cleanup();
    };
  });
  return {
    session,
    $sessionSignal: $signal,
    broadcastSessionUpdate: (trigger) => broadcastSessionUpdate(trigger)
  };
}

// node_modules/defu/dist/defu.mjs
function isPlainObject2(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) {
    return false;
  }
  if (Symbol.iterator in value) {
    return false;
  }
  if (Symbol.toStringTag in value) {
    return Object.prototype.toString.call(value) === "[object Module]";
  }
  return true;
}
function _defu(baseObject, defaults, namespace = ".", merger) {
  if (!isPlainObject2(defaults)) {
    return _defu(baseObject, {}, namespace, merger);
  }
  const object = { ...defaults };
  for (const key of Object.keys(baseObject)) {
    if (key === "__proto__" || key === "constructor") {
      continue;
    }
    const value = baseObject[key];
    if (value === null || value === void 0) {
      continue;
    }
    if (merger && merger(object, key, value, namespace)) {
      continue;
    }
    if (Array.isArray(value) && Array.isArray(object[key])) {
      object[key] = [...value, ...object[key]];
    } else if (isPlainObject2(value) && isPlainObject2(object[key])) {
      object[key] = _defu(
        value,
        object[key],
        (namespace ? `${namespace}.` : "") + key.toString(),
        merger
      );
    } else {
      object[key] = value;
    }
  }
  return object;
}
function createDefu(merger) {
  return (...arguments_) => (
    // eslint-disable-next-line unicorn/no-array-reduce
    arguments_.reduce((p, c) => _defu(p, c, "", merger), {})
  );
}
var defu = createDefu();
var defuFn = createDefu((object, key, currentValue) => {
  if (object[key] !== void 0 && typeof currentValue === "function") {
    object[key] = currentValue(object[key]);
    return true;
  }
});
var defuArrayFn = createDefu((object, key, currentValue) => {
  if (Array.isArray(object[key]) && typeof currentValue === "function") {
    object[key] = currentValue(object[key]);
    return true;
  }
});

// node_modules/@better-fetch/fetch/dist/index.js
var BetterFetchError = class extends Error {
  constructor(status, statusText, error) {
    super(statusText || status.toString(), { cause: error });
    this.status = status;
    this.statusText = statusText;
    this.error = error;
    Error.captureStackTrace(this, this.constructor);
  }
};
var initializePlugins = async (url, options) => {
  let opts = options || {};
  const hooks = {
    onRequest: [options === null || options === void 0 ? void 0 : options.onRequest],
    onResponse: [options === null || options === void 0 ? void 0 : options.onResponse],
    onSuccess: [options === null || options === void 0 ? void 0 : options.onSuccess],
    onError: [options === null || options === void 0 ? void 0 : options.onError],
    onRetry: [options === null || options === void 0 ? void 0 : options.onRetry]
  };
  if (!options || !(options === null || options === void 0 ? void 0 : options.plugins)) return {
    url,
    options: opts,
    hooks
  };
  for (const plugin of (options === null || options === void 0 ? void 0 : options.plugins) || []) {
    var _plugin$hooks, _plugin$hooks2, _plugin$hooks3, _plugin$hooks4, _plugin$hooks5;
    if (plugin.init) {
      var _plugin$init;
      const pluginRes = await ((_plugin$init = plugin.init) === null || _plugin$init === void 0 ? void 0 : _plugin$init.call(plugin, url.toString(), opts));
      opts = pluginRes.options || opts;
      url = pluginRes.url;
    }
    hooks.onRequest.push((_plugin$hooks = plugin.hooks) === null || _plugin$hooks === void 0 ? void 0 : _plugin$hooks.onRequest);
    hooks.onResponse.push((_plugin$hooks2 = plugin.hooks) === null || _plugin$hooks2 === void 0 ? void 0 : _plugin$hooks2.onResponse);
    hooks.onSuccess.push((_plugin$hooks3 = plugin.hooks) === null || _plugin$hooks3 === void 0 ? void 0 : _plugin$hooks3.onSuccess);
    hooks.onError.push((_plugin$hooks4 = plugin.hooks) === null || _plugin$hooks4 === void 0 ? void 0 : _plugin$hooks4.onError);
    hooks.onRetry.push((_plugin$hooks5 = plugin.hooks) === null || _plugin$hooks5 === void 0 ? void 0 : _plugin$hooks5.onRetry);
  }
  return {
    url,
    options: opts,
    hooks
  };
};
var LinearRetryStrategy = class {
  constructor(options) {
    this.options = options;
  }
  shouldAttemptRetry(attempt, response) {
    if (this.options.shouldRetry) return Promise.resolve(attempt < this.options.attempts && this.options.shouldRetry(response));
    return Promise.resolve(attempt < this.options.attempts);
  }
  getDelay() {
    return this.options.delay;
  }
};
var ExponentialRetryStrategy = class {
  constructor(options) {
    this.options = options;
  }
  shouldAttemptRetry(attempt, response) {
    if (this.options.shouldRetry) return Promise.resolve(attempt < this.options.attempts && this.options.shouldRetry(response));
    return Promise.resolve(attempt < this.options.attempts);
  }
  getDelay(attempt) {
    return Math.min(this.options.maxDelay, this.options.baseDelay * 2 ** attempt);
  }
};
function createRetryStrategy(options) {
  if (typeof options === "number") return new LinearRetryStrategy({
    type: "linear",
    attempts: options,
    delay: 1e3
  });
  switch (options.type) {
    case "linear":
      return new LinearRetryStrategy(options);
    case "exponential":
      return new ExponentialRetryStrategy(options);
    default:
      throw new Error("Invalid retry strategy");
  }
}
var methods = [
  "get",
  "post",
  "put",
  "patch",
  "delete"
];
function parseMethodModifier(path) {
  if (!path.startsWith("@")) return {
    method: void 0,
    path
  };
  const separator = path.indexOf("/");
  const method = path.slice(1, separator === -1 ? void 0 : separator);
  if (!methods.includes(method)) return {
    method: void 0,
    path
  };
  return {
    method,
    path: separator === -1 ? path : path.slice(separator + 1)
  };
}
var isReservedPathSegment = (value) => value === "." || value === "..";
var encodeLiteralPathSegment = (segment) => segment.split(":").map((part) => encodeURIComponent(part)).join(":");
function resolvePathSegment(segment, pathParams) {
  const pathParam = pathParams.get(segment);
  if (pathParam === void 0) return encodeLiteralPathSegment(segment);
  if (isReservedPathSegment(pathParam)) throw new TypeError("Path parameters cannot be reserved path segments");
  return encodeURIComponent(pathParam);
}
function getURL$1(url, option) {
  const { baseURL, params, query } = option || {
    query: {},
    params: {},
    baseURL: ""
  };
  let basePath = url.startsWith("http") ? url.split("/").slice(0, 3).join("/") : baseURL || "";
  const { path: requestPath } = parseMethodModifier(url);
  if (requestPath !== url) url = `/${requestPath}`;
  if (!basePath.endsWith("/")) basePath += "/";
  let [path, urlQuery] = url.replace(basePath, "").split("?");
  const queryParams = new URLSearchParams(urlQuery);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;
    let serializedValue;
    if (typeof value === "string") serializedValue = value;
    else if (Array.isArray(value)) {
      for (const val of value) queryParams.append(key, val);
      continue;
    } else serializedValue = JSON.stringify(value);
    queryParams.set(key, serializedValue);
  }
  const pathParams = /* @__PURE__ */ new Map();
  if (params) if (Array.isArray(params)) {
    const paramPaths = path.split("/").filter((p) => p.startsWith(":"));
    for (const [index, key] of paramPaths.entries()) {
      const value = params[index];
      pathParams.set(key, String(value));
    }
  } else for (const [key, value] of Object.entries(params)) pathParams.set(`:${key}`, String(value));
  path = path.split("/").map((segment) => resolvePathSegment(segment, pathParams)).join("/");
  path = path.replace(/^\/+/, "");
  let queryParamString = queryParams.toString();
  queryParamString = queryParamString.length > 0 ? `?${queryParamString}`.replace(/\+/g, "%20") : "";
  if (!basePath.startsWith("http")) return `${basePath}${path}${queryParamString}`;
  return new URL(`${path}${queryParamString}`, basePath);
}
var getAuthHeader = async (options) => {
  const headers = {};
  const getValue = async (value) => typeof value === "function" ? await value() : value;
  if (options === null || options === void 0 ? void 0 : options.auth) {
    if (options.auth.type === "Bearer") {
      const token = await getValue(options.auth.token);
      if (!token) return headers;
      headers["authorization"] = `Bearer ${token}`;
    } else if (options.auth.type === "Basic") {
      const [username, password] = await Promise.all([getValue(options.auth.username), getValue(options.auth.password)]);
      if (!username || !password) return headers;
      headers["authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (options.auth.type === "Custom") {
      const [prefix, value] = await Promise.all([getValue(options.auth.prefix), getValue(options.auth.value)]);
      if (!value) return headers;
      headers["authorization"] = `${prefix !== null && prefix !== void 0 ? prefix : ""} ${value}`;
    }
  }
  return headers;
};
var JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(;.+)?$/i;
function detectResponseType(request) {
  const _contentType = request.headers.get("content-type");
  const textTypes = /* @__PURE__ */ new Set([
    "image/svg",
    "application/xml",
    "application/xhtml",
    "application/html"
  ]);
  if (!_contentType) return "json";
  const contentType = _contentType.split(";").shift() || "";
  if (JSON_RE.test(contentType)) return "json";
  if (textTypes.has(contentType) || contentType.startsWith("text/")) return "text";
  return "blob";
}
function isJSONParsable(value) {
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
}
function isJSONSerializable(value) {
  if (value === void 0) return false;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === null) return true;
  if (t !== "object") return false;
  if (Array.isArray(value)) return true;
  if (value.buffer) return false;
  return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
function jsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}
function isFunction(value) {
  return typeof value === "function";
}
function getFetch(options) {
  if (options === null || options === void 0 ? void 0 : options.customFetchImpl) return options.customFetchImpl;
  if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) return globalThis.fetch;
  if (typeof window !== "undefined" && isFunction(window.fetch)) return window.fetch;
  throw new Error("No fetch implementation found");
}
function mergeHeaders(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source) continue;
    if (source instanceof Headers) source.forEach((value, key) => {
      merged[key] = value;
    });
    else {
      const entries = Array.isArray(source) ? source : Object.entries(source);
      for (const [key, value] of entries) if (value !== null && value !== void 0) merged[key] = value;
    }
  }
  return merged;
}
async function getHeaders(opts) {
  const headers = new Headers(mergeHeaders(opts === null || opts === void 0 ? void 0 : opts.headers, await getAuthHeader(opts)));
  if (!headers.has("content-type")) {
    const contentType = detectContentType(opts === null || opts === void 0 ? void 0 : opts.body);
    if (contentType) headers.set("content-type", contentType);
  }
  return headers;
}
function detectContentType(body) {
  if (isJSONSerializable(body)) return "application/json";
  return null;
}
function getMediaType(headers) {
  const contentType = headers.get("content-type");
  return contentType ? contentType.split(";")[0].trim().toLowerCase() : null;
}
function getBody(options, headers) {
  const { body } = options;
  if (!body) return null;
  if (!isJSONSerializable(body)) return body;
  if (typeof body === "string") return body;
  if (getMediaType(headers) === "application/x-www-form-urlencoded") return new URLSearchParams(body).toString();
  return JSON.stringify(body);
}
function getMethod(url, options) {
  if (options === null || options === void 0 ? void 0 : options.method) return options.method.toUpperCase();
  const { method } = parseMethodModifier(url);
  if (method) return method.toUpperCase();
  return (options === null || options === void 0 ? void 0 : options.body) ? "POST" : "GET";
}
function getTimeout(options, controller) {
  let abortTimeout;
  if (!(options === null || options === void 0 ? void 0 : options.signal) && (options === null || options === void 0 ? void 0 : options.timeout)) abortTimeout = setTimeout(() => controller === null || controller === void 0 ? void 0 : controller.abort(), options === null || options === void 0 ? void 0 : options.timeout);
  return {
    abortTimeout,
    clearTimeout: () => {
      if (abortTimeout) clearTimeout(abortTimeout);
    }
  };
}
var ValidationError = class ValidationError2 extends Error {
  constructor(issues, message) {
    super(message || JSON.stringify(issues, null, 2));
    this.issues = issues;
    Object.setPrototypeOf(this, ValidationError2.prototype);
  }
};
async function parseStandardSchema(schema, input) {
  const result = await schema["~standard"].validate(input);
  if (result.issues) throw new ValidationError(result.issues);
  return result.value;
}
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
var betterFetch = async (url, options) => {
  var _opts$signal, _options$body, _options$jsonParser;
  const { hooks, url: __url, options: opts } = await initializePlugins(url, options);
  const fetch2 = getFetch(opts);
  const controller = new AbortController();
  const signal = (_opts$signal = opts.signal) !== null && _opts$signal !== void 0 ? _opts$signal : controller.signal;
  const _url = getURL$1(__url, opts);
  const headers = await getHeaders(opts);
  const body = getBody(opts, headers);
  const method = getMethod(__url, opts);
  const context = _objectSpread2(_objectSpread2({}, opts), {}, {
    url: _url,
    headers,
    body,
    method,
    signal
  });
  for (const onRequest of hooks.onRequest) if (onRequest) {
    const res = await onRequest(context);
    if (typeof res === "object" && res !== null) Object.assign(context, res);
  }
  if ("pipeTo" in context && typeof context.pipeTo === "function" || typeof (options === null || options === void 0 || (_options$body = options.body) === null || _options$body === void 0 ? void 0 : _options$body.pipe) === "function") {
    if (!("duplex" in context)) context.duplex = "half";
  }
  const { clearTimeout: clearTimeout2 } = getTimeout(opts, controller);
  let response = await fetch2(context.url, context);
  clearTimeout2();
  const responseContext = {
    response,
    request: context
  };
  for (const onResponse of hooks.onResponse) if (onResponse) {
    var _options$hookOptions;
    const r = await onResponse(_objectSpread2(_objectSpread2({}, responseContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions = options.hookOptions) === null || _options$hookOptions === void 0 ? void 0 : _options$hookOptions.cloneResponse) ? response.clone() : response }));
    if (r instanceof Response) response = r;
    else if (typeof r === "object" && r !== null) response = r.response;
  }
  if (response.ok) {
    if (!(context.method !== "HEAD")) return {
      data: "",
      error: null
    };
    const responseType = detectResponseType(response);
    const successContext = {
      data: null,
      response,
      request: context
    };
    if (responseType === "json" || responseType === "text") {
      var _context$jsonParser;
      const text = await response.text();
      successContext.data = await ((_context$jsonParser = context.jsonParser) !== null && _context$jsonParser !== void 0 ? _context$jsonParser : jsonParse)(text);
    } else successContext.data = await response[responseType]();
    if (context === null || context === void 0 ? void 0 : context.output) {
      if (context.output && !context.disableValidation) successContext.data = await parseStandardSchema(context.output, successContext.data);
    }
    for (const onSuccess of hooks.onSuccess) if (onSuccess) {
      var _options$hookOptions2;
      await onSuccess(_objectSpread2(_objectSpread2({}, successContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions2 = options.hookOptions) === null || _options$hookOptions2 === void 0 ? void 0 : _options$hookOptions2.cloneResponse) ? response.clone() : response }));
    }
    if (options === null || options === void 0 ? void 0 : options.throw) return successContext.data;
    return {
      data: successContext.data,
      error: null
    };
  }
  const parser = (_options$jsonParser = options === null || options === void 0 ? void 0 : options.jsonParser) !== null && _options$jsonParser !== void 0 ? _options$jsonParser : jsonParse;
  const responseText = await response.text();
  const isJSONResponse = isJSONParsable(responseText);
  const errorObject = isJSONResponse ? await parser(responseText) : null;
  const errorContext = {
    response,
    responseText,
    request: context,
    error: _objectSpread2(_objectSpread2({}, errorObject), {}, {
      status: response.status,
      statusText: response.statusText
    })
  };
  for (const onError of hooks.onError) if (onError) {
    var _options$hookOptions3;
    await onError(_objectSpread2(_objectSpread2({}, errorContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions3 = options.hookOptions) === null || _options$hookOptions3 === void 0 ? void 0 : _options$hookOptions3.cloneResponse) ? response.clone() : response }));
  }
  if (options === null || options === void 0 ? void 0 : options.retry) {
    var _options$retryAttempt;
    const retryStrategy = createRetryStrategy(options.retry);
    const _retryAttempt = (_options$retryAttempt = options.retryAttempt) !== null && _options$retryAttempt !== void 0 ? _options$retryAttempt : 0;
    if (await retryStrategy.shouldAttemptRetry(_retryAttempt, response)) {
      for (const onRetry of hooks.onRetry) if (onRetry) await onRetry(responseContext);
      const delay = retryStrategy.getDelay(_retryAttempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return await betterFetch(url, _objectSpread2(_objectSpread2({}, options), {}, { retryAttempt: _retryAttempt + 1 }));
    }
  }
  if (options === null || options === void 0 ? void 0 : options.throw) throw new BetterFetchError(response.status, response.statusText, isJSONResponse ? errorObject : responseText);
  return {
    data: null,
    error: _objectSpread2(_objectSpread2({}, errorObject), {}, {
      status: response.status,
      statusText: response.statusText
    })
  };
};
var applySchemaPlugin = (config) => ({
  id: "apply-schema",
  name: "Apply Schema",
  version: "1.0.0",
  async init(url, options) {
    var _config$plugins;
    let opts = _objectSpread2(_objectSpread2({}, options), config.query !== void 0 && { query: _objectSpread2(_objectSpread2({}, config.query), options === null || options === void 0 ? void 0 : options.query) });
    const schema = ((_config$plugins = config.plugins) === null || _config$plugins === void 0 || (_config$plugins = _config$plugins.find((plugin) => {
      var _plugin$schema;
      return ((_plugin$schema = plugin.schema) === null || _plugin$schema === void 0 ? void 0 : _plugin$schema.config) ? url.startsWith(plugin.schema.config.baseURL || "") || url.startsWith(plugin.schema.config.prefix || "") : false;
    })) === null || _config$plugins === void 0 ? void 0 : _config$plugins.schema) || config.schema;
    if (schema) {
      var _schema$config, _schema$config2;
      let urlKey = url;
      if ((_schema$config = schema.config) === null || _schema$config === void 0 ? void 0 : _schema$config.prefix) {
        if (urlKey.startsWith(schema.config.prefix)) {
          urlKey = urlKey.replace(schema.config.prefix, "");
          if (schema.config.baseURL) url = url.replace(schema.config.prefix, schema.config.baseURL);
        }
      }
      if ((_schema$config2 = schema.config) === null || _schema$config2 === void 0 ? void 0 : _schema$config2.baseURL) {
        if (urlKey.startsWith(schema.config.baseURL)) urlKey = urlKey.replace(schema.config.baseURL, "");
      }
      if (urlKey.startsWith("/") && urlKey.charAt(1) === "@") urlKey = urlKey.substring(1);
      const keySchema = schema.schema[urlKey];
      if (keySchema) {
        var _keySchema$method;
        const { method: schemaMethod, path } = parseMethodModifier(urlKey);
        if (schemaMethod) url = url.slice(0, url.length - urlKey.length) + path;
        let validatedHeaders = options === null || options === void 0 ? void 0 : options.headers;
        if (keySchema.headers && !(options === null || options === void 0 ? void 0 : options.disableValidation)) {
          const normalizedHeaders = {};
          if (options === null || options === void 0 ? void 0 : options.headers) {
            if (options.headers instanceof Headers) options.headers.forEach((value, key) => {
              normalizedHeaders[key.toLowerCase()] = value;
            });
            else if (typeof options.headers === "object") {
              for (const [key, value] of Object.entries(options.headers)) if (value !== null && value !== void 0) normalizedHeaders[key.toLowerCase()] = value;
            }
          }
          const validated = await parseStandardSchema(keySchema.headers, normalizedHeaders);
          const finalHeaders = {};
          for (const [key, value] of Object.entries(validated)) finalHeaders[key.toLowerCase()] = value;
          validatedHeaders = finalHeaders;
        }
        const method = (_keySchema$method = keySchema.method) !== null && _keySchema$method !== void 0 ? _keySchema$method : schemaMethod;
        opts = _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, opts), method !== void 0 && { method }), keySchema.output !== void 0 && { output: keySchema.output }), validatedHeaders !== void 0 && { headers: validatedHeaders });
        if (!(options === null || options === void 0 ? void 0 : options.disableValidation)) {
          if (keySchema.query) {
            opts.query = await parseStandardSchema(keySchema.query, options === null || options === void 0 ? void 0 : options.query);
            if (opts.query !== null && typeof opts.query === "object") {
              const defaults = _objectSpread2({}, config.query);
              for (const key of Object.keys(defaults)) if ((options === null || options === void 0 ? void 0 : options.query) && Object.prototype.hasOwnProperty.call(options.query, key)) defaults[key] = options.query[key];
              opts.query = _objectSpread2(_objectSpread2({}, defaults), opts.query);
            }
          }
          opts = _objectSpread2(_objectSpread2({}, opts), {}, {
            body: keySchema.input ? await parseStandardSchema(keySchema.input, options === null || options === void 0 ? void 0 : options.body) : options === null || options === void 0 ? void 0 : options.body,
            params: keySchema.params ? await parseStandardSchema(keySchema.params, options === null || options === void 0 ? void 0 : options.params) : options === null || options === void 0 ? void 0 : options.params
          });
        }
        return {
          url,
          options: opts
        };
      }
    }
    return _objectSpread2({ url }, (options !== void 0 || config.query !== void 0) && { options: opts });
  }
});
var createFetch = (config) => {
  async function $fetch(url, options) {
    const opts = _objectSpread2(_objectSpread2(_objectSpread2({}, config), options), {}, {
      headers: mergeHeaders(config === null || config === void 0 ? void 0 : config.headers, options === null || options === void 0 ? void 0 : options.headers),
      plugins: [
        ...(config === null || config === void 0 ? void 0 : config.plugins) || [],
        applySchemaPlugin(config || {}),
        ...(options === null || options === void 0 ? void 0 : options.plugins) || []
      ]
    });
    if (config === null || config === void 0 ? void 0 : config.catchAllError) try {
      return await betterFetch(url, opts);
    } catch (error) {
      return {
        data: null,
        error: {
          status: 500,
          statusText: "Fetch Error",
          message: "Fetch related error. Captured by catchAllError option. See error property for more details.",
          error
        }
      };
    }
    return await betterFetch(url, opts);
  }
  return $fetch;
};

// node_modules/better-auth/dist/client/config.mjs
var resolvePublicAuthUrl = (basePath) => {
  if (typeof process === "undefined") return void 0;
  const path = basePath ?? "/api/auth";
  if (process.env.NEXT_PUBLIC_AUTH_URL) return process.env.NEXT_PUBLIC_AUTH_URL;
  if (typeof window === "undefined") {
    if (process.env.NEXTAUTH_URL) try {
      return process.env.NEXTAUTH_URL;
    } catch {
    }
    if (process.env.VERCEL_URL) try {
      const protocol = process.env.VERCEL_URL.startsWith("http") ? "" : "https://";
      return `${new URL(`${protocol}${process.env.VERCEL_URL}`).origin}${path}`;
    } catch {
    }
  }
};
var getClientConfig = (options, loadEnv) => {
  const isCredentialsSupported = "credentials" in Request.prototype;
  const baseURL = getBaseURL(options?.baseURL, options?.basePath, void 0, loadEnv) ?? resolvePublicAuthUrl(options?.basePath) ?? "/api/auth";
  const pluginsFetchPlugins = options?.plugins?.flatMap((plugin) => plugin.fetchPlugins).filter((pl) => pl !== void 0) || [];
  const lifeCyclePlugin = {
    id: "lifecycle-hooks",
    name: "lifecycle-hooks",
    hooks: {
      onSuccess: options?.fetchOptions?.onSuccess,
      onError: options?.fetchOptions?.onError,
      onRequest: options?.fetchOptions?.onRequest,
      onResponse: options?.fetchOptions?.onResponse
    }
  };
  const { onSuccess: _onSuccess, onError: _onError, onRequest: _onRequest, onResponse: _onResponse, ...restOfFetchOptions } = options?.fetchOptions || {};
  const $fetch = createFetch({
    baseURL,
    ...isCredentialsSupported ? { credentials: "include" } : {},
    method: "GET",
    jsonParser(text) {
      if (!text) return null;
      return parseJSON(text, { strict: false });
    },
    customFetchImpl: fetch,
    ...restOfFetchOptions,
    plugins: [
      lifeCyclePlugin,
      ...restOfFetchOptions.plugins || [],
      ...options?.disableDefaultFetchPlugins ? [] : [redirectPlugin],
      ...pluginsFetchPlugins
    ]
  });
  const { $sessionSignal, session, broadcastSessionUpdate } = getSessionAtom($fetch, options);
  let hasHydrated = false;
  const hydrateSession = (sessionData) => {
    if (hasHydrated || sessionData === null) return;
    hasHydrated = true;
    hydrateSessionAtom(session, sessionData);
  };
  const plugins = options?.plugins || [];
  let pluginsActions = {};
  const pluginsAtoms = {
    $sessionSignal,
    session
  };
  const pluginPathMethods = {
    "/sign-out": "POST",
    "/revoke-sessions": "POST",
    "/revoke-other-sessions": "POST",
    "/delete-user": "POST"
  };
  const atomListeners = [{
    signal: "$sessionSignal",
    matcher(path) {
      return path === "/sign-out" || path === "/update-user" || path === "/update-session" || path === "/sign-up/email" || path === "/sign-in/email" || path === "/delete-user" || path === "/verify-email" || path === "/revoke-sessions" || path === "/revoke-session" || path === "/revoke-other-sessions" || path === "/change-email" || path === "/change-password";
    },
    callback(path) {
      if (path === "/sign-out") broadcastSessionUpdate("signout");
      else if (path === "/update-user" || path === "/update-session") broadcastSessionUpdate("updateUser");
    }
  }];
  for (const plugin of plugins) {
    if (plugin.getAtoms) Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
    if (plugin.pathMethods) Object.assign(pluginPathMethods, plugin.pathMethods);
    if (plugin.atomListeners) atomListeners.push(...plugin.atomListeners);
  }
  const $store = {
    notify: (signal) => {
      pluginsAtoms[signal].set(!pluginsAtoms[signal].get());
    },
    listen: (signal, listener) => {
      pluginsAtoms[signal].subscribe(listener);
    },
    atoms: pluginsAtoms
  };
  for (const plugin of plugins) if (plugin.getActions) pluginsActions = defu(plugin.getActions?.($fetch, $store, options) ?? {}, pluginsActions);
  return {
    get baseURL() {
      return baseURL;
    },
    pluginsActions,
    pluginsAtoms,
    pluginPathMethods,
    atomListeners,
    hydrateSession,
    $sessionSignal,
    $fetch,
    $store
  };
};

// node_modules/better-auth/dist/utils/is-atom.mjs
function isAtom(value) {
  return typeof value === "object" && value !== null && "get" in value && typeof value.get === "function" && "lc" in value && typeof value.lc === "number";
}

// node_modules/@better-auth/core/dist/utils/string.mjs
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
var WORD_PATTERN = /[\p{Ll}\d]+|\p{Lu}+(?!\p{Ll})|\p{Lu}[\p{Ll}\d]+|\p{Lo}+/gu;
var APOSTROPHE_PATTERN = /['\u2019]/g;
function splitWords(input) {
  return input.replace(APOSTROPHE_PATTERN, "").match(WORD_PATTERN) ?? [];
}
function toKebabCase(input) {
  return splitWords(input).map((word) => word.toLowerCase()).join("-");
}

// node_modules/better-auth/dist/client/proxy.mjs
function getMethod2(path, knownPathMethods, args) {
  const method = knownPathMethods[path];
  const { fetchOptions, query: _query, ...body } = args || {};
  if (method) return method;
  if (fetchOptions?.method) return fetchOptions.method;
  if (body && Object.keys(body).length > 0) return "POST";
  return "GET";
}
function createDynamicPathProxy(routes, client, knownPathMethods, atoms, atomListeners) {
  function createProxy(path = []) {
    return new Proxy(function() {
    }, {
      get(_, prop) {
        if (typeof prop !== "string") return;
        if (prop === "then" || prop === "catch" || prop === "finally") return;
        const fullPath = [...path, prop];
        let current = routes;
        for (const segment of fullPath) if (current && typeof current === "object" && segment in current) current = current[segment];
        else {
          current = void 0;
          break;
        }
        if (typeof current === "function") return current;
        if (isAtom(current)) return current;
        return createProxy(fullPath);
      },
      apply: async (_, __, args) => {
        const routePath = "/" + path.map(toKebabCase).join("/");
        const arg = args[0] || {};
        const fetchOptions = args[1] || {};
        const { query, fetchOptions: argFetchOptions, ...body } = arg;
        const options = {
          ...fetchOptions,
          ...argFetchOptions
        };
        const method = getMethod2(routePath, knownPathMethods, arg);
        return await client(routePath, {
          ...options,
          body: method === "GET" ? void 0 : {
            ...body,
            ...options?.body || {}
          },
          query: query || options?.query,
          method,
          async onSuccess(context) {
            await options?.onSuccess?.(context);
            if (!atomListeners || options.disableSignal) return;
            const matches = atomListeners.filter((s) => s.matcher(routePath));
            if (!matches.length) return;
            const visited = /* @__PURE__ */ new Set();
            for (const match of matches) {
              const signal = atoms[match.signal];
              if (!signal) return;
              if (visited.has(match.signal)) continue;
              visited.add(match.signal);
              const val = signal.get();
              setTimeout(() => {
                signal.set(!val);
              }, 10);
              match.callback?.(routePath);
            }
          }
        });
      }
    });
  }
  return createProxy();
}

// node_modules/better-auth/dist/client/vanilla.mjs
function createAuthClient(options) {
  const { pluginPathMethods, pluginsActions, pluginsAtoms, hydrateSession, $fetch, atomListeners, $store } = getClientConfig(options);
  const resolvedHooks = {};
  for (const [key, value] of Object.entries(pluginsAtoms)) resolvedHooks[`use${capitalizeFirstLetter(key)}`] = value;
  return createDynamicPathProxy({
    ...pluginsActions,
    ...resolvedHooks,
    hydrateSession,
    $fetch,
    $store
  }, $fetch, pluginPathMethods, pluginsAtoms, atomListeners);
}

// node_modules/better-auth/dist/plugins/anonymous/error-codes.mjs
var ANONYMOUS_ERROR_CODES = defineErrorCodes({
  INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
  FAILED_TO_CREATE_USER: "Failed to create user",
  COULD_NOT_CREATE_SESSION: "Could not create session",
  ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY: "Anonymous users cannot sign in again anonymously",
  FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
  FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "Failed to delete anonymous user sessions",
  USER_IS_NOT_ANONYMOUS: "User is not anonymous",
  DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled"
});

// node_modules/better-auth/dist/plugins/anonymous/client.mjs
var anonymousClient = () => {
  return {
    id: "anonymous",
    version: PACKAGE_VERSION,
    $InferServerPlugin: {},
    pathMethods: {
      "/sign-in/anonymous": "POST",
      "/delete-anonymous-user": "POST"
    },
    atomListeners: [{
      matcher: (path) => path === "/sign-in/anonymous",
      signal: "$sessionSignal"
    }],
    $ERROR_CODES: ANONYMOUS_ERROR_CODES
  };
};

// node_modules/better-auth/dist/plugins/email-otp/error-codes.mjs
var EMAIL_OTP_ERROR_CODES = defineErrorCodes({
  OTP_EXPIRED: "OTP expired",
  INVALID_OTP: "Invalid OTP",
  TOO_MANY_ATTEMPTS: "Too many attempts"
});

// node_modules/better-auth/dist/plugins/email-otp/client.mjs
var emailOTPClient = () => {
  return {
    id: "email-otp",
    version: PACKAGE_VERSION,
    $InferServerPlugin: {},
    atomListeners: [{
      matcher: (path) => path === "/email-otp/verify-email" || path === "/sign-in/email-otp" || path === "/email-otp/request-email-change",
      signal: "$sessionSignal"
    }],
    $ERROR_CODES: EMAIL_OTP_ERROR_CODES
  };
};

// node_modules/@better-auth/passkey/dist/version-CJg9BCj_.mjs
var PASSKEY_ERROR_CODES = defineErrorCodes({
  CHALLENGE_NOT_FOUND: "Challenge not found",
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "You are not allowed to register this passkey",
  FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
  PASSKEY_NOT_FOUND: "Passkey not found",
  AUTHENTICATION_FAILED: "Authentication failed",
  UNABLE_TO_CREATE_SESSION: "Unable to create session",
  USER_NOT_FOUND: "User not found",
  FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
  PREVIOUSLY_REGISTERED: "Previously registered",
  REGISTRATION_CANCELLED: "Registration cancelled",
  AUTH_CANCELLED: "Auth cancelled",
  UNKNOWN_ERROR: "Unknown error",
  SESSION_REQUIRED: "Passkey registration requires an authenticated session",
  RESOLVE_USER_REQUIRED: "Passkey registration requires either an authenticated session or a resolveUser callback when requireSession is false",
  RESOLVED_USER_INVALID: "Resolved user is invalid"
});
var PACKAGE_VERSION2 = "1.7.6";

// node_modules/@simplewebauthn/browser/esm/helpers/bufferToBase64URLString.js
function bufferToBase64URLString(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// node_modules/@simplewebauthn/browser/esm/helpers/base64URLStringToBuffer.js
function base64URLStringToBuffer(base64URLString) {
  const base64 = base64URLString.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - base64.length % 4) % 4;
  const padded = base64.padEnd(base64.length + padLength, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

// node_modules/@simplewebauthn/browser/esm/helpers/browserSupportsWebAuthn.js
function browserSupportsWebAuthn() {
  return _browserSupportsWebAuthnInternals.stubThis(globalThis?.PublicKeyCredential !== void 0 && typeof globalThis.PublicKeyCredential === "function");
}
var _browserSupportsWebAuthnInternals = {
  stubThis: (value) => value
};

// node_modules/@simplewebauthn/browser/esm/helpers/toPublicKeyCredentialDescriptor.js
function toPublicKeyCredentialDescriptor(descriptor) {
  const { id } = descriptor;
  return {
    ...descriptor,
    id: base64URLStringToBuffer(id),
    /**
     * `descriptor.transports` is an array of our `AuthenticatorTransportFuture` that includes newer
     * transports that TypeScript's DOM lib is ignorant of. Convince TS that our list of transports
     * are fine to pass to WebAuthn since browsers will recognize the new value.
     */
    transports: descriptor.transports
  };
}

// node_modules/@simplewebauthn/browser/esm/helpers/isValidDomain.js
function isValidDomain(hostname) {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    hostname === "localhost" || // Support punycode (ACE) or ascii labels and domains
    /^((xn--[a-z0-9-]+|[a-z0-9]+(-[a-z0-9]+)*)\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(hostname)
  );
}

// node_modules/@simplewebauthn/browser/esm/helpers/webAuthnError.js
var WebAuthnError = class extends Error {
  constructor({ message, code, cause, name }) {
    super(message, { cause });
    Object.defineProperty(this, "code", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.name = name ?? cause.name;
    this.code = code;
  }
};

// node_modules/@simplewebauthn/browser/esm/helpers/identifyRegistrationError.js
function identifyRegistrationError({ error, options }) {
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "ConstraintError") {
    if (publicKey.authenticatorSelection?.requireResidentKey === true) {
      return new WebAuthnError({
        message: "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: error
      });
    } else if (
      // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
      options.mediation === "conditional" && publicKey.authenticatorSelection?.userVerification === "required"
    ) {
      return new WebAuthnError({
        message: "User verification was required during automatic registration but it could not be performed",
        code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
        cause: error
      });
    } else if (publicKey.authenticatorSelection?.userVerification === "required") {
      return new WebAuthnError({
        message: "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: error
      });
    }
  } else if (error.name === "InvalidStateError") {
    return new WebAuthnError({
      message: "The authenticator was previously registered",
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      cause: error
    });
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "NotSupportedError") {
    const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
    if (validPubKeyCredParams.length === 0) {
      return new WebAuthnError({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: error
      });
    }
    return new WebAuthnError({
      message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
      code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = globalThis.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${globalThis.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rp.id !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "TypeError") {
    if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
      return new WebAuthnError({
        message: "User ID was not between 1 and 64 characters",
        code: "ERROR_INVALID_USER_ID_LENGTH",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new credential",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return error;
}

// node_modules/@simplewebauthn/browser/esm/helpers/webAuthnAbortService.js
var BaseWebAuthnAbortService = class {
  constructor() {
    Object.defineProperty(this, "controller", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
  }
  createNewAbortSignal() {
    if (this.controller) {
      const abortError = new Error("Cancelling existing WebAuthn API call for new one");
      abortError.name = "AbortError";
      this.controller.abort(abortError);
    }
    const newController = new AbortController();
    this.controller = newController;
    return newController.signal;
  }
  cancelCeremony() {
    if (this.controller) {
      const abortError = new Error("Manually cancelling existing WebAuthn API call");
      abortError.name = "AbortError";
      this.controller.abort(abortError);
      this.controller = void 0;
    }
  }
};
var WebAuthnAbortService = new BaseWebAuthnAbortService();

// node_modules/@simplewebauthn/browser/esm/helpers/toAuthenticatorAttachment.js
var attachments = ["cross-platform", "platform"];
function toAuthenticatorAttachment(attachment) {
  if (!attachment) {
    return;
  }
  if (attachments.indexOf(attachment) < 0) {
    return;
  }
  return attachment;
}

// node_modules/@simplewebauthn/browser/esm/methods/startRegistration.js
async function startRegistration(options) {
  if (!options.optionsJSON && options.challenge) {
    console.warn("startRegistration() was not called correctly. It will try to continue with the provided options, but this call should be refactored to use the expected call structure instead. See https://simplewebauthn.dev/docs/packages/browser#typeerror-cannot-read-properties-of-undefined-reading-challenge for more information.");
    options = { optionsJSON: options };
  }
  const { optionsJSON, useAutoRegister = false } = options;
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not supported in this browser");
  }
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLStringToBuffer(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64URLStringToBuffer(optionsJSON.user.id)
    },
    excludeCredentials: optionsJSON.excludeCredentials?.map(toPublicKeyCredentialDescriptor)
  };
  const createOptions = {};
  if (useAutoRegister) {
    createOptions.mediation = "conditional";
  }
  createOptions.publicKey = publicKey;
  createOptions.signal = WebAuthnAbortService.createNewAbortSignal();
  let credential;
  try {
    credential = await navigator.credentials.create(createOptions);
  } catch (err) {
    throw identifyRegistrationError({ error: err, options: createOptions });
  }
  if (!credential) {
    throw new Error("Registration was not completed");
  }
  const { id, rawId, response, type } = credential;
  let transports = void 0;
  if (typeof response.getTransports === "function") {
    transports = response.getTransports();
  }
  let responsePublicKeyAlgorithm = void 0;
  if (typeof response.getPublicKeyAlgorithm === "function") {
    try {
      responsePublicKeyAlgorithm = response.getPublicKeyAlgorithm();
    } catch (error) {
      warnOnBrokenImplementation("getPublicKeyAlgorithm()", error);
    }
  }
  let responsePublicKey = void 0;
  if (typeof response.getPublicKey === "function") {
    try {
      const _publicKey = response.getPublicKey();
      if (_publicKey !== null) {
        responsePublicKey = bufferToBase64URLString(_publicKey);
      }
    } catch (error) {
      warnOnBrokenImplementation("getPublicKey()", error);
    }
  }
  let responseAuthenticatorData;
  if (typeof response.getAuthenticatorData === "function") {
    try {
      responseAuthenticatorData = bufferToBase64URLString(response.getAuthenticatorData());
    } catch (error) {
      warnOnBrokenImplementation("getAuthenticatorData()", error);
    }
  }
  return {
    id,
    rawId: bufferToBase64URLString(rawId),
    response: {
      attestationObject: bufferToBase64URLString(response.attestationObject),
      clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
      transports,
      publicKeyAlgorithm: responsePublicKeyAlgorithm,
      publicKey: responsePublicKey,
      authenticatorData: responseAuthenticatorData
    },
    type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: toAuthenticatorAttachment(credential.authenticatorAttachment)
  };
}
function warnOnBrokenImplementation(methodName, cause) {
  console.warn(`The browser extension that intercepted this WebAuthn API call incorrectly implemented ${methodName}. You should report this error to them.
`, cause);
}

// node_modules/@simplewebauthn/browser/esm/helpers/browserSupportsWebAuthnAutofill.js
function browserSupportsWebAuthnAutofill() {
  if (!browserSupportsWebAuthn()) {
    return _browserSupportsWebAuthnAutofillInternals.stubThis(new Promise((resolve) => resolve(false)));
  }
  const globalPublicKeyCredential = globalThis.PublicKeyCredential;
  if (globalPublicKeyCredential?.isConditionalMediationAvailable === void 0) {
    return _browserSupportsWebAuthnAutofillInternals.stubThis(new Promise((resolve) => resolve(false)));
  }
  return _browserSupportsWebAuthnAutofillInternals.stubThis(globalPublicKeyCredential.isConditionalMediationAvailable());
}
var _browserSupportsWebAuthnAutofillInternals = {
  stubThis: (value) => value
};

// node_modules/@simplewebauthn/browser/esm/helpers/identifyAuthenticationError.js
function identifyAuthenticationError({ error, options }) {
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = globalThis.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${globalThis.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rpId !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return error;
}

// node_modules/@simplewebauthn/browser/esm/methods/startAuthentication.js
async function startAuthentication(options) {
  if (!options.optionsJSON && options.challenge) {
    console.warn("startAuthentication() was not called correctly. It will try to continue with the provided options, but this call should be refactored to use the expected call structure instead. See https://simplewebauthn.dev/docs/packages/browser#typeerror-cannot-read-properties-of-undefined-reading-challenge for more information.");
    options = { optionsJSON: options };
  }
  const { optionsJSON, useBrowserAutofill = false, verifyBrowserAutofillInput = true } = options;
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not supported in this browser");
  }
  let allowCredentials;
  if (optionsJSON.allowCredentials?.length !== 0) {
    allowCredentials = optionsJSON.allowCredentials?.map(toPublicKeyCredentialDescriptor);
  }
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLStringToBuffer(optionsJSON.challenge),
    allowCredentials
  };
  const getOptions = {};
  if (useBrowserAutofill) {
    if (!await browserSupportsWebAuthnAutofill()) {
      throw Error("Browser does not support WebAuthn autofill");
    }
    const eligibleInputs = document.querySelectorAll("input[autocomplete$='webauthn']");
    if (eligibleInputs.length < 1 && verifyBrowserAutofillInput) {
      throw Error('No <input> with "webauthn" as the only or last value in its `autocomplete` attribute was detected');
    }
    getOptions.mediation = "conditional";
    publicKey.allowCredentials = [];
  }
  getOptions.publicKey = publicKey;
  getOptions.signal = WebAuthnAbortService.createNewAbortSignal();
  let credential;
  try {
    credential = await navigator.credentials.get(getOptions);
  } catch (err) {
    throw identifyAuthenticationError({ error: err, options: getOptions });
  }
  if (!credential) {
    throw new Error("Authentication was not completed");
  }
  const { id, rawId, response, type } = credential;
  let userHandle = void 0;
  if (response.userHandle) {
    userHandle = bufferToBase64URLString(response.userHandle);
  }
  return {
    id,
    rawId: bufferToBase64URLString(rawId),
    response: {
      authenticatorData: bufferToBase64URLString(response.authenticatorData),
      clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
      signature: bufferToBase64URLString(response.signature),
      userHandle
    },
    type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: toAuthenticatorAttachment(credential.authenticatorAttachment)
  };
}

// node_modules/@better-auth/passkey/dist/client.mjs
var getPasskeyActions = ($fetch, { $listPasskeys, $store }) => {
  const signInPasskey = async (opts, options) => {
    const response = await $fetch("/passkey/generate-authenticate-options", {
      method: "GET",
      throw: false
    });
    if (!response.data) return response;
    const mergedExtensions = response.data.extensions || opts?.extensions ? {
      ...response.data.extensions || {},
      ...opts?.extensions || {}
    } : void 0;
    let res;
    try {
      res = await startAuthentication({
        optionsJSON: {
          ...response.data,
          extensions: mergedExtensions
        },
        useBrowserAutofill: opts?.autoFill
      });
    } catch (err) {
      return {
        data: null,
        error: {
          code: err instanceof WebAuthnError ? err.code : "AUTH_CANCELLED",
          message: PASSKEY_ERROR_CODES.AUTH_CANCELLED.message,
          status: 400,
          statusText: "BAD_REQUEST"
        }
      };
    }
    try {
      const { clientExtensionResults, ...responseBody } = res;
      const verified = await $fetch("/passkey/verify-authentication", {
        body: { response: responseBody },
        ...opts?.fetchOptions,
        ...options,
        method: "POST",
        throw: false
      });
      $listPasskeys.set(Math.random());
      $store.notify("$sessionSignal");
      if (opts?.returnWebAuthnResponse) return {
        ...verified,
        webauthn: {
          response: res,
          clientExtensionResults
        }
      };
      return verified;
    } catch (err) {
      console.error(`[Better Auth] Error verifying passkey`, err);
      return {
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: PASSKEY_ERROR_CODES.AUTH_CANCELLED.message,
          status: 400,
          statusText: "BAD_REQUEST"
        }
      };
    }
  };
  const registerPasskey = async (opts, fetchOpts) => {
    const options = await $fetch("/passkey/generate-register-options", {
      method: "GET",
      query: {
        ...opts?.authenticatorAttachment && { authenticatorAttachment: opts.authenticatorAttachment },
        ...opts?.name && { name: opts.name },
        ...opts?.context && { context: opts.context }
      },
      throw: false
    });
    if (!options.data) return options;
    try {
      const mergedExtensions = options.data.extensions || opts?.extensions ? {
        ...options.data.extensions || {},
        ...opts?.extensions || {}
      } : void 0;
      const res = await startRegistration({
        optionsJSON: {
          ...options.data,
          extensions: mergedExtensions
        },
        useAutoRegister: opts?.useAutoRegister
      });
      const { clientExtensionResults, ...responseBody } = res;
      const verified = await $fetch("/passkey/verify-registration", {
        ...opts?.fetchOptions,
        ...fetchOpts,
        body: {
          response: responseBody,
          name: opts?.name,
          ...opts?.createSession && { createSession: true }
        },
        method: "POST",
        throw: false
      });
      if (!verified.data) return verified;
      $listPasskeys.set(Math.random());
      if (verified.data.session) $store.notify("$sessionSignal");
      if (opts?.returnWebAuthnResponse) return {
        ...verified,
        webauthn: {
          response: res,
          clientExtensionResults
        }
      };
      return verified;
    } catch (e) {
      if (e instanceof WebAuthnError) {
        if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return {
          data: null,
          error: {
            code: e.code,
            message: PASSKEY_ERROR_CODES.PREVIOUSLY_REGISTERED.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
        if (e.code === "ERROR_CEREMONY_ABORTED") return {
          data: null,
          error: {
            code: e.code,
            message: PASSKEY_ERROR_CODES.REGISTRATION_CANCELLED.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
        return {
          data: null,
          error: {
            code: e.code,
            message: e.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
      }
      return {
        data: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: e instanceof Error ? e.message : PASSKEY_ERROR_CODES.UNKNOWN_ERROR.message,
          status: 500,
          statusText: "INTERNAL_SERVER_ERROR"
        }
      };
    }
  };
  return {
    signIn: {
      /**
      * Sign in with a registered passkey
      */
      passkey: signInPasskey
    },
    passkey: {
      /**
      * Add a passkey to the user account
      */
      addPasskey: registerPasskey
    },
    /**
    * Inferred Internal Types
    */
    $Infer: {}
  };
};
var passkeyClient = () => {
  const $listPasskeys = atom();
  return {
    id: "passkey",
    version: PACKAGE_VERSION2,
    $InferServerPlugin: {},
    getActions: ($fetch, $store) => getPasskeyActions($fetch, {
      $listPasskeys,
      $store
    }),
    getAtoms($fetch) {
      return {
        listPasskeys: useAuthQuery($listPasskeys, "/passkey/list-user-passkeys", $fetch, { method: "GET" }),
        $listPasskeys
      };
    },
    pathMethods: {
      "/passkey/register": "POST",
      "/passkey/authenticate": "POST"
    },
    atomListeners: [{
      matcher(path) {
        return path === "/passkey/verify-registration" || path === "/passkey/delete-passkey" || path === "/passkey/update-passkey" || path === "/sign-out";
      },
      signal: "$listPasskeys"
    }, {
      matcher: (path) => path === "/passkey/verify-authentication",
      signal: "$sessionSignal"
    }],
    $ERROR_CODES: PASSKEY_ERROR_CODES
  };
};

// web/app.js
var auth = createAuthClient({ baseURL: location.origin, plugins: [anonymousClient(), emailOTPClient(), passkeyClient()] });
var j = (path, body) => fetch(path, { method: body ? "POST" : "GET", credentials: "include", headers: body ? { "content-type": "application/json" } : {}, body: body && JSON.stringify(body) }).then((r) => r.json());
var brief = (r) => r?.error ? { error: r.error.code ?? r.error.message ?? r.error.status } : { ok: true };
window.spike = {
  async run() {
    const out = {};
    const email = `web+${Date.now()}@example.com`;
    out.guest = brief(await auth.signIn.anonymous());
    await j("/contacts", { name: "Web-guest-contact" });
    out.guestAddPasskey = brief(await auth.passkey.addPasskey({ name: "guest-key" }));
    out.afterGuestPasskey = (await auth.getSession()).data?.user?.isAnonymous;
    await auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    const { otp } = await j(`/__test/otp?email=${encodeURIComponent(email)}`);
    out.upgrade = brief(await auth.signIn.emailOtp({ email, otp }));
    const s1 = (await auth.getSession()).data;
    out.account = { id: s1?.user?.id, isAnonymous: s1?.user?.isAnonymous };
    out.contactsAfterUpgrade = (await j("/contacts")).contacts;
    out.addPasskey = brief(await auth.passkey.addPasskey({ name: "kawase-web" }));
    out.passkeys = ((await auth.passkey.listUserPasskeys()).data ?? []).map((p) => ({ name: p.name, deviceType: p.deviceType }));
    await auth.signOut();
    out.signedOut = !(await auth.getSession()).data;
    out.passkeySignIn = brief(await auth.signIn.passkey());
    const s2 = (await auth.getSession()).data;
    out.sameUser = s2?.user?.id === s1?.user?.id;
    out.contactsAfterPasskey = (await j("/contacts")).contacts;
    document.getElementById("out").textContent = JSON.stringify(out, null, 2);
    return out;
  }
};
document.getElementById("out").textContent = "ready";
