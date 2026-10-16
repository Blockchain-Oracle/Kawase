// kawase/no-reduced-motion-in-render: a server-rendered component must not branch its output on useReducedMotion().
//
// The hook is null on the server and reads matchMedia on the client's first render, so output that depends on it
// hydrates against HTML rendered for full motion, and React does not patch the attributes that differ (10-16: every
// Reveal block on the landing stayed invisible with reduced motion). Read it where nothing reaches the HTML (effects,
// useCallback, named handlers, `on*`/`ref` props, motion's `transition` and gesture props) and hold the render at rest
// with CSS (`motion-reduce:` classes), which the server's first paint already obeys. Only the libraries' hook is
// checked: a hook of your own that starts false on both sides and reads matchMedia in an effect is safe (the docs'
// visual/video.tsx).

const HOOK = "useReducedMotion";
/** Where the hook reads matchMedia during the client's first render. */
const HOOK_SOURCES = new Set(["motion", "motion/react", "framer-motion", "react-native-reanimated"]);
/** Hooks whose callbacks and dependency lists run after the render, so what they read never reaches the HTML. */
const AFTER_RENDER_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect", "useCallback", "useImperativeHandle", "useEffectEvent"]);
/** JSX props applied after hydration: event handlers, ref callbacks, motion's transitions and gestures. */
const AFTER_RENDER_PROP = /^(on[A-Z]\w*|ref|transition|whileHover|whileTap|whileFocus|whileDrag)$/;

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function calleeName(call) {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
  return undefined;
}

function enclosingFunction(node) {
  for (let at = node.parent; at; at = at.parent) if (FUNCTION_TYPES.has(at.type)) return at;
  return undefined;
}

/** Whether `node`, inside `component`, is evaluated while rendering (so its value can shape the HTML). */
function readDuringRender(node, component) {
  for (let child = node, parent = node.parent; parent && child !== component; child = parent, parent = parent.parent) {
    if (parent.type === "JSXAttribute" && parent.value === child && AFTER_RENDER_PROP.test(String(parent.name.name))) return false;
    if (parent.type === "CallExpression" && parent.arguments.includes(child) && AFTER_RENDER_HOOKS.has(calleeName(parent))) return false;
    // A function the render defines and something calls later: a handler bound to a name.
    if (child.type === "FunctionDeclaration") return false;
    if (FUNCTION_TYPES.has(child.type) && parent.type === "VariableDeclarator" && parent.init === child) return false;
    // Any other function (an array's .map in JSX, useMemo, useTransform) runs during the render: keep walking.
  }
  return true;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow render output that depends on useReducedMotion() in server-rendered components." },
    schema: [],
    messages: {
      render:
        "`{{name}}` comes from useReducedMotion(), which is null on the server: output that depends on it hydrates against HTML rendered for full motion, and React keeps the server's styles. Hold the element at rest with CSS (`motion-reduce:` classes) and read the hook only in effects, handlers or transition/gesture props.",
      inline:
        "useReducedMotion() is null on the server: call it once at the top of the component, and read it only in effects, handlers or transition/gesture props; hold the render at rest with CSS (`motion-reduce:` classes).",
    },
  },
  create(context) {
    /** Local names the library hook is imported under, and namespaces it can be called through. */
    const hooks = new Set();
    const namespaces = new Set();
    const isHookCall = (node) => {
      if (node?.type !== "CallExpression") return false;
      const callee = node.callee;
      if (callee.type === "Identifier") return hooks.has(callee.name);
      return callee.type === "MemberExpression" && callee.object.type === "Identifier" && namespaces.has(callee.object.name) && calleeName(node) === HOOK;
    };
    return {
      ImportDeclaration(node) {
        if (!HOOK_SOURCES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          else if (specifier.type === "ImportSpecifier" && (specifier.imported.name ?? specifier.imported.value) === HOOK) hooks.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        if (!isHookCall(node)) return;
        if (node.parent.type === "VariableDeclarator" && node.parent.init === node && node.parent.id.type === "Identifier") return;
        context.report({ node, messageId: "inline" });
      },
      VariableDeclarator(node) {
        if (!isHookCall(node.init) || node.id.type !== "Identifier") return;
        const component = enclosingFunction(node);
        if (!component) return;
        const [variable] = context.sourceCode.getDeclaredVariables(node);
        for (const reference of variable?.references ?? []) {
          if (reference.init || reference.isWrite()) continue;
          if (readDuringRender(reference.identifier, component)) {
            context.report({ node: reference.identifier, messageId: "render", data: { name: node.id.name } });
          }
        }
      },
    };
  },
};
