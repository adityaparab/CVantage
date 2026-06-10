/** CVantage commit message rules — conventional commits with fixed scopes. */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['server', 'frontend', 'shared', 'infra', 'docs', 'deps']],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'body-max-line-length': [1, 'always', 100],
  },
};
