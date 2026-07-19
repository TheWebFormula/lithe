export const policyHTML = trustedTypes.createPolicy('li-html', {
  createHTML: (string) => {
    return string;
  }
});
