/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['node_modules/**', '.cache/**'],
  rules: {
    'no-duplicate-selectors': null, // We often have duplicate selectors in our CSS, and it doesn't cause any issues.
    'block-no-empty': null, // We often have empty blocks in our CSS, and it doesn't cause any issues.
    'selector-id-pattern': null, // freshRSS has its own IDs
    'selector-class-pattern': null, // freshRSS has its own classes
    'alpha-value-notation': 'number',
    'color-function-notation': 'modern',
    'comment-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'declaration-empty-line-before': null,
    'rule-empty-line-before': [
      'always-multi-line',
      {
        except: ['first-nested'],
        ignore: ['after-comment']
      }
    ]
  }
};
