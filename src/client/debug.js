let unhandledCues = [];
let handledCues = [];
let renderingComponent;

export function componentRenderStaet(component) {
  renderingComponent = component;
}

export function componentRenderEnd() {
  if (unhandledCues.length > 0) {
    const templateExpressions = renderingComponent.template.toString().match(/\\?\${(?:[^{}]|{(?:[^{}]|{[^{}]*}){0,1000}}){0,1000}}/g);
    const expressionParts = unhandledCues.map(v => templateExpressions[v.valueIndex] || '');
    console.warn(`There are Cue's used in template expression that will not auto update, please refer to ()`);
    console.warn('Expressions: ', expressionParts.join(' - '))
  }
  unhandledCues.length = 0;
  handledCues.length = 0;
  renderingComponent = undefined;
}

export function registerRenderCue(cue) {
  // console.log(renderingComponent, cue)
  handledCues.push(cue);
}

export function renderCueUsed(cue, valueIndex) {
  const index = handledCues.findIndex(v => v === cue);
  if (index !== -1) {
    handledCues.splice(index, 1);
    unhandledCues.push({ cue, valueIndex });
  }
}

export let enabled = true;
