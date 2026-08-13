let isReducedMotion;
let viewTransitionNameGlobal;
let viewTransitionNameGlobalBack;
let backTransitionStack = new Map();
let initiated = false;


const viewTransitions = {
  'expand-from-element': {
    enableBack: true,

    setup(toElement, fromElement) {
      const fromBounds = fromElement.getBoundingClientRect();
      const fromBorderRadius = getComputedStyle(fromElement).borderRadius;
      const toBounds = toElement.getBoundingClientRect();
      const top = fromBounds.top - toBounds.top;
      const left = fromBounds.left - toBounds.left;

      // TODO work out a better way to manage scroll position
      document.documentElement.style.setProperty('--expand-from-element-top', `${top - window.scrollY}px`);
      document.documentElement.style.setProperty('--expand-from-element-left', `${left}px`);
      document.documentElement.style.setProperty('--expand-from-element-width', `${fromBounds.width}px`);
      document.documentElement.style.setProperty('--expand-from-element-height', `${fromBounds.height}px`);
      document.documentElement.style.setProperty('--expand-from-element-border-radius', fromBorderRadius);

      return {
        scroll: window.scrollY,
        top,
        left,
        width: fromBounds.width,
        height: fromBounds.height,
        borderRadius: fromBorderRadius
      };
    },
    cleanup() {
      document.documentElement.style.removeProperty('--expand-from-element-top');
      document.documentElement.style.removeProperty('--expand-from-element-left');
      document.documentElement.style.removeProperty('--expand-from-element-width');
      document.documentElement.style.removeProperty('--expand-from-element-height');
      document.documentElement.style.removeProperty('--expand-from-element-border-radius');
    },

    setupBack(toElement, { scroll, top, left, width, height, fromBorderRadius }) {
      document.documentElement.style.setProperty('--expand-from-element-scrollY', `${scroll || 0}px`);
      document.documentElement.style.setProperty('--expand-from-element-top', `${top || 0}px`);
      document.documentElement.style.setProperty('--expand-from-element-left', `${left || 0}px`);
      document.documentElement.style.setProperty('--expand-from-element-width', `${width || 0}px`);
      document.documentElement.style.setProperty('--expand-from-element-height', `${height || 0}px`);
      document.documentElement.style.setProperty('--expand-from-element-border-radius', `${fromBorderRadius || '0px'}`);
    },
    cleanupBack() {
      document.documentElement.style.removeProperty('--expand-from-element-scrollY');
      document.documentElement.style.removeProperty('--expand-from-element-top');
      document.documentElement.style.removeProperty('--expand-from-element-width');
      document.documentElement.style.removeProperty('--expand-from-element-height');
      document.documentElement.style.removeProperty('--expand-from-element-left');
      document.documentElement.style.removeProperty('--expand-from-element-border-radius');
    }
  },

  'slide-right': {
    setup() {
      const scrollTop = document.documentElement.scrollTop;
      document.documentElement.style.setProperty('--mc-view-transition-scroll-fix-margin', `-${scrollTop}px`);
    }
  },

  'slide-left': {
    setup() {
      const scrollTop = document.documentElement.scrollTop;
      document.documentElement.style.setProperty('--mc-view-transition-scroll-fix-margin', `-${scrollTop}px`);
    }
  }
}



export function registerViewTransition(name, config = { setup() { }, animate() { } }) {
  if (viewTransitions[name]) console.warn(`There is already a view transition registered with the name '${name}'. You have overridden it`);
  viewTransitions[name] = config;
}


export async function runTransition({ oldContainer, newContainer, back, routeId }, renderCallback) {
  if (isReducedMotion === undefined) isReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (viewTransitionNameGlobal === undefined) {
    const viewTransitionMeta = document.querySelector('[name=view-transition]');
    viewTransitionNameGlobal = viewTransitionMeta?.content || false;
    const viewTransitionBackMeta = document.querySelector('[name=view-transition-back]');
    viewTransitionNameGlobalBack = viewTransitionBackMeta?.content || false;
  }

  if (!document.startViewTransition || isReducedMotion) {
    renderCallback();
    return;
  }

  // check if we have a back transition
  const backTransitionDetails = back && backTransitionStack.get(routeId);
  const targetViewTransition = oldContainer?.getAttribute('view-transition');
  const transitionName = back ? (backTransitionDetails?.name || viewTransitionNameGlobalBack || viewTransitionNameGlobal) : (targetViewTransition || viewTransitionNameGlobal);
  if (!transitionName) {
    renderCallback();
    return;
  }

  if (!initiated) initiateCSS();
  const transitionItem = viewTransitions[transitionName] || viewTransitions[transitionName.replace(/-back$/, '')];
  if (!transitionItem) {
    console.warn(`No view transition with name: ${transitionName}`);
  }

  let setupData;
  let setupMethod = back && transitionItem.enableBack ? transitionItem.setupBack : transitionItem.setup;
  if (setupMethod) setupData = backTransitionDetails ? setupMethod(newContainer, backTransitionDetails.setupData) : setupMethod(newContainer, oldContainer);

  const targetViewTransitionBack = transitionItem?.enableBack ? `${transitionName}-back` : oldContainer?.getAttribute('view-transition-back');
  if (targetViewTransitionBack) {
    backTransitionStack.set(routeId, {
      name: targetViewTransitionBack,
      setupData
    });
  }

  document.documentElement.style.setProperty('--mc-view-transition-scroll-position', `-${window.scrollY}px`);
  newContainer.style.viewTransitionName = transitionName;
  const transition = document.startViewTransition(renderCallback);

  try {
    await transition.ready;

    // we do not want the outer intercept to wait on this
    transition.finished.then(() => {
      newContainer.style.viewTransitionName = '';
      document.documentElement.style.removeProperty('--mc-view-transition-scroll-position');
      let cleanupMethod = back && transitionItem.enableBack ? transitionItem.cleanupBack : transitionItem.cleanup;
      if (cleanupMethod) cleanupMethod();
    });
  } catch (e) {
    console.error(e);
    renderCallback();
  }
}

function initiateCSS() {
  let styles = new CSSStyleSheet();
  styles.replaceSync(/*css*/`
  ::view-transition-group(*) {
    animation: none;
    mix-blend-mode: normal;
  }

  ::view-transition-image-pair(*) {
    isolation: auto;
  }

  ::view-transition-old(cross-fade) {
    animation: page-cross-fade;
    animation-duration: 400ms;
    animation-timing-function: ease;
    animation-direction: back;
  }
  ::view-transition-new(cross-fade) {
    animation: page-cross-fade;
    animation-duration: 400ms;
    animation-timing-function: ease;
  }

  ::view-transition-old(slide-left) {
    animation: page-slide-left-out;
    animation-duration: 400ms;
    animation-timing-function: ease;
  }
  ::view-transition-new(slide-left) {
    animation: page-slide-left-in;
    animation-duration: 400ms;
    animation-timing-function: ease;
  }

  ::view-transition-old(slide-right) {
    animation: page-slide-right-out;
    animation-duration: 400ms;
    animation-timing-function: ease;
  }
  ::view-transition-new(slide-right) {
    animation: page-slide-right-in;
    animation-duration: 400ms;
    animation-timing-function: ease;
  }

  ::view-transition-old(expand-from-element),
  ::view-transition-new(expand-from-element),
  ::view-transition-old(expand-from-element-back),
  ::view-transition-new(expand-from-element-back) {
    animation: none;
    box-sizing: border-box;
  }

  ::view-transition-new(expand-from-element) {
    animation: expand-from-element;
    animation-duration: 400ms;
    animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }

  ::view-transition-old(expand-from-element-back) {
    animation: expand-from-element-back;
    animation-duration: 240ms;
    animation-timing-function: cubic-bezier(0.3, 0, 1, 1);
  }

  ::view-transition-old(expand-from-element) {
    transform: translateY(var(--mc-view-transition-scroll-position, 0px));
  }


  @keyframes page-cross-fade {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes page-slide-left-in {
    0% {
      transform: translateX(100%);
      clip-path: inset(0px 100% 0px 0px);
    }
    100% {
      transform: translateX(0px);
      clip-path: inset(0px 0px 0px 0px);
    }
  }

  @keyframes page-slide-left-out {
    0% {
      transform: translateX(0px);
      clip-path: inset(0px 0px 0px 0px);
    }
    100% {
      transform: translateX(-100%);
      clip-path: inset(0px 0px 0px 100%);
    }
  }

  @keyframes page-slide-right-in {
    0% {
      transform: translateX(-100%);
      clip-path: inset(0px 0px 0px 100%);
    }
    100% {
      transform: translateX(0px);
      clip-path: inset(0px 0px 0px 0px);
    }
  }

  @keyframes page-slide-right-out {
    0% {
      transform: translateX(0px);
      clip-path: inset(0px 0px 0px 0px);
    }
    100% {
      transform: translateX(100%);
      clip-path: inset(0px 100% 0px 0px);
    }
  }

  @keyframes expand-from-element {
    from {
      transform: translate(var(--expand-from-element-left), var(--expand-from-element-top));
      clip-path: xywh(0px 0px var(--expand-from-element-width) var(--expand-from-element-height) round var(--expand-from-element-radius, 0px));
    }
    to {
      transform: translate(0px, 0px);
      clip-path: xywh(0px 0px 100% 100% round 0px);
    }
  }

  @keyframes expand-from-element-back {
    from {
      transform: translate(0px, var(--expand-from-element-scrollY, 0px));
      clip-path: xywh(0px 0px 100% 100% round 0px);
      z-index: 1;
    }
    to {
      transform: translate(var(--expand-from-element-left), var(--expand-from-element-top));
      clip-path: xywh(0px 0px var(--expand-from-element-width) var(--expand-from-element-height) round var(--expand-from-element-radius, 0px));
      z-index: 1;
    }
  }`);
  document.adoptedStyleSheets.push(styles);

  initiated = true;
}
