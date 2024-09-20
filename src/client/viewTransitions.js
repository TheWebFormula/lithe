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
            height: `${targetBounds.height}px`,
            width: `${targetBounds.width}px`
          },
          {
            transform: `translate(0px, 0px)`,
            height: `${container.offsetHeight}px`,
            width: `${container.offsetWidth}px`,
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

export { viewTransitions };
export function registerViewTransition(name, func) {
  if (viewTransitions[name]) console.warn(`There is already a view transition registered with the name '${name}'. You have overridden it`);
  viewTransitions[name] = func;
}

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
  animation-direction: reverse;
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
::view-transition-new(expand-from-element) {
  animation: none;
  box-sizing: border-box;
  border-radius: var(--mc-shape-large, 0);
}

::view-transition-old(expand-from-element) {
  transform: var(--mc-view-transition-scroll-fix);
}

::view-transition-old(slide-left),
::view-transition-old(slide-right) {
  margin-top: var(--mc-view-transition-scroll-fix-margin);
}

::view-transition-new(expand-from-element) {
  object-fit: none;
  object-position: 0px 0px;
  height: 100%;
  width: auto;
  overflow: hidden;
  mix-blend-mode: normal;
  animation: page-fade-in-with-box-shadow;
  animation-duration: 400ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

@keyframes page-cross-fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes page-fade-in-with-box-shadow {
  0% {
    opacity: 0;
    box-shadow: 0px 1px 2px 0px rgba(0,0,0,0.3),
      0px 1px 3px 1px rgba(0,0,0,0.15);
  }
  20% {
    opacity: 1;
  }
  60% {
    box-shadow: 0px 1px 2px 0px rgba(0,0,0,0.3),
      0px 1px 3px 1px rgba(0,0,0,0.15);
  }
  100% {
    box-shadow: none;
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