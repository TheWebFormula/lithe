let isReducedMotion;
let viewTransitionNameGlobal;
let viewTransitionNameGlobalBack;
let backTransitionStack = new Map();
let initiated = false;

const viewTransitions = {
  'expand-from-element': {
    setup(container, target) {
      const scrollTop = document.documentElement.scrollTop;
      document.documentElement.style.setProperty('--mc-view-transition-scroll-fix', `translateY(-${scrollTop}px)`);
      const containerBounds = container.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();

      return {
        containerBounds,
        targetBounds,
        scrollTop
      };
    },
    animate(container, { containerBounds, targetBounds, scrollTop }) {
      document.documentElement.animate(
        [
          {
            transform: `translate(${targetBounds.x - containerBounds.x}px, ${targetBounds.y - containerBounds.y - scrollTop}px)`,
            clipPath: `rect(0px ${targetBounds.width}px ${targetBounds.height}px 0px round var(--mc-shape-large, 0))`,
            opacity: 0
          },
          {
            opacity: 1,
            offset: 0.12
          },
          {
            transform: `translate(0px, 0px)`,
            clipPath: `rect(0px ${container.offsetWidth}px ${container.offsetHeight}px 0px round 0px)`,
            opacity: 1
          }
        ],
        {
          duration: 400,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
          pseudoElement: '::view-transition-new(expand-from-element)'
        }
      );
    }
  },

  'expand-from-element-back': {
    setup(container, data) {
      const scrollTop = document.documentElement.scrollTop;
      document.documentElement.style.setProperty('--mc-view-transition-scroll-fix', `translateY(-${scrollTop}px)`);
      const containerBounds = container.getBoundingClientRect();
      const targetBounds = data.targetBounds;

      return {
        containerBounds,
        targetBounds,
        scrollTop
      };
    },
    animate(container, { containerBounds, targetBounds, scrollTop }) {
      const targetY = targetBounds.y - containerBounds.y - scrollTop;
      const keyframeOffsetTargetY = targetY * 0.05;
      document.documentElement.animate(
        [
          {
            transform: `translate(0px, 0px)`,
            clipPath: `rect(0px ${container.offsetWidth}px ${container.offsetHeight}px 0px round 0px)`,
            opacity: 1
          },
          {
            transform: `translate(0px, ${keyframeOffsetTargetY}px)`,
            offset: 0.3
          },
          {
            opacity: 1,
            offset: 0.88
          },
          {
            transform: `translate(${targetBounds.x - containerBounds.x}px, ${targetBounds.y - containerBounds.y - scrollTop}px)`,
            clipPath: `rect(0px ${targetBounds.width}px ${targetBounds.height}px 0px round var(--mc-shape-large, 0))`,
            opacity: 0
          }
        ],
        {
          duration: 240,
          easing: 'cubic-bezier(0.3, 0, 1, 1)',
          pseudoElement: '::view-transition-old(expand-from-element-back)'
        }
      );
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
  const transitionItem = viewTransitions[transitionName];
  if (!transitionItem) {
    console.warn(`No view transition with name: ${transitionName}`);
  }

  let setupData;
  if (transitionItem?.setup) setupData = backTransitionDetails ? transitionItem.setup(newContainer, backTransitionDetails.setupData) : transitionItem.setup(newContainer, oldContainer);

  const targetViewTransitionBack = oldContainer?.getAttribute('view-transition-back');
  if (targetViewTransitionBack) {
    backTransitionStack.set(routeId, {
      name: targetViewTransitionBack,
      setupData
    });
  }

  newContainer.style.viewTransitionName = transitionName;
  newContainer.firstElementChild.style.viewTransitionName = `${transitionName}-child`;
  const transition = document.startViewTransition(renderCallback);
  await transition.ready;
  if (transitionItem?.animate) transitionItem.animate(newContainer, setupData);
  transition.finished.then(() => {
    newContainer.style.viewTransitionName = '';
  });
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
    border-radius: var(--mc-shape-large, 0);
  }

  ::view-transition-old(expand-from-element) {
    transform: var(--mc-view-transition-scroll-fix);
  }

  ::view-transition-new(expand-from-element) {
    object-fit: none;
    object-position: 0px 0px;
    height: 100%;
    width: auto;
    overflow: hidden;
    mix-blend-mode: normal;
  }

  ::view-transition-old(expand-from-element-back) {
    object-fit: none;
    object-position: 0px 0px;
    overflow: hidden;
    mix-blend-mode: normal;
    z-index: 1;
  }

  ::view-transition-old(slide-left),
  ::view-transition-old(slide-right) {
    margin-top: var(--mc-view-transition-scroll-fix-margin);
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
  `);
  document.adoptedStyleSheets.push(styles);

  initiated = true;
}
