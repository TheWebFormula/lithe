let exclusionProperties = [
  'tag',
  'role',
  'template'
];


const camelCaseRegex = /([a-zA-Z])(?=[A-Z])/g;
function myPlugin({
  includeStaticProperties,
  includePrivateProperties
} = {}) {
  return {
    name: 'my-plugin',
    analyzePhase({ ts, node, moduleDoc, context }) {
      if (node.kind !== ts.SyntaxKind.ClassDeclaration) return;

      const className = node.name.getText();
      const component = moduleDoc?.declarations?.find(declaration => declaration.name === className);
      const content = node.getText();
      if (!content.includes('customElements.define')) {
        context.remove = true;
        return;
      }

      const attributesMatch = content.match(/observedAttributes\s*(?:Extended)?\s*=\s*(\{[\s\S]*?\});/);
      try {
        if (attributesMatch[1]) {
          const attributes = Object.entries(JSON.parse(attributesMatch[1].replace(/'/g, '"').replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":'))).map(v => ({
            name: v[0],
            type: { text: v[1].type === 'toggle' ? 'boolean' : v[1].type },
            fieldName: v[0].replace(camelCaseRegex, '$1-').toLowerCase(),
            reflect: v[1].reflect === true ? true : false
          }));
          component.attributes = attributes.filter(v => v.type.text !== 'event');
          component.events = attributes.filter(v => v.type.text === 'event');
        }
      } catch (e) {
        console.error(e)
      }
    },

    moduleLinkPhase({ moduleDoc, context }) {
      let classes = moduleDoc?.declarations?.filter(declaration => declaration.kind === 'class' || declaration.kind === 'mixin');
      let pageTitle;
      for (let cl of classes) {
        cl.members = cl.members.filter(member => {
          if (member.static === true && (member.name === 'title' && member.default !== '')) pageTitle = member.default;
          return !(
            (!includeStaticProperties && member.static === true && (member.name !== 'title' || !member.default))
            || (!includePrivateProperties && member.privacy === 'private')
            || exclusionProperties.includes(member.name)
            || member.name === 'attributeChangedCallbackExtended'
          );
        });
        if (pageTitle) cl.description = `Page: ${pageTitle}${cl.description ? ` - $#{cl.description}` : ''} `
        cl.members.forEach(m => {
          const attrMatch = (cl.attributes || []).find(a => a.name === m.name) || (cl.events || []).find(a => a.name === m.name);
          if (attrMatch) {
            m.attribute = attrMatch.fieldName;
            m.type = attrMatch.type;
            m.reflect = attrMatch.reflect;
          }
        });
      }
    },

    packageLinkPhase({ customElementsManifest, context }) {
      customElementsManifest.modules = customElementsManifest.modules.filter(m => m.declarations.length > 0)
    }
  }
}

export default {
  globs: ["docs/**/*.js"],
  // outdir: "dist",
  dev: false,
  watch: false,
  dependencies: false,
  packagejson: true,
  litelement: false,
  catalyst: false,
  fast: false,
  stencil: false,
  plugins: [
    myPlugin(),
  ]
};
