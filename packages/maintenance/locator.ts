import { locatorBinding, uniquenessSites } from '../generation/ui-locators.ts';
import ts from 'typescript';
import { AppError } from '../domain/model.ts';
import { validateGeneratedFile } from '../generation/staging.ts';

// Positions come from the parsed source, never arbitrary text replacement or executable output.
export function replaceLocator(path: string, before: string, oldValue: string, newValue: string) {
  if (!/^ui\/(pages|components)\/[A-Za-z0-9_/-]+\.tsx?$/.test(path))
    throw new AppError(403, 'Locator repairs must reuse an existing Page/component');
  if (
    !oldValue ||
    !newValue ||
    oldValue === newValue ||
    newValue.length > 160 ||
    [...newValue].some((c) => c.charCodeAt(0) < 32)
  )
    throw new AppError(400, 'Choose distinct nonempty locator literals');
  const file = ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true);
  const matches: ts.StringLiteralLike[] = [];
  const sites: ts.CallExpression[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (['getByLabel', 'getByTestId'].includes(method)) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg) && arg.text === oldValue) {
          matches.push(arg);
          sites.push(node);
        }
      }
      if (
        method === 'getByRole' &&
        node.arguments[1] &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        for (const property of node.arguments[1].properties)
          if (
            ts.isPropertyAssignment(property) &&
            property.name.getText(file) === 'name' &&
            ts.isStringLiteralLike(property.initializer) &&
            property.initializer.text === oldValue
          ) {
            matches.push(property.initializer);
            sites.push(node);
          }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  // Repeated use of a test ID in uniqueness/visibility/text assertions is intentionally supported.
  if (!matches.length || matches.length > 12)
    throw new AppError(422, 'No bounded literal locator occurrences found');
  for (const site of sites) {
    const binding = locatorBinding(site, file);
    if (binding?.startsWith('this.')) {
      let cls: ts.Node | undefined = site;
      while (cls && !ts.isClassDeclaration(cls) && !ts.isClassExpression(cls)) cls = cls.parent;
      if (!cls || !uniquenessSites(cls, binding, file).length)
        throw new AppError(
          422,
          'Repaired constructor locator requires an awaited uniqueness assertion for the same field in its class scope',
        );
      continue;
    }
    let scope: ts.Node = site;
    while (
      scope.parent &&
      !ts.isMethodDeclaration(scope) &&
      !ts.isFunctionDeclaration(scope) &&
      !ts.isArrowFunction(scope) &&
      !ts.isFunctionExpression(scope)
    )
      scope = scope.parent;
    const expressions = new Set([site.getText(file)]);
    const declarations = (node: ts.Node) => {
      if (
        node !== scope &&
        (ts.isMethodDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node))
      )
        return;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer?.getText(file) === site.getText(file)
      )
        expressions.add(node.name.text);
      ts.forEachChild(node, declarations);
    };
    declarations(scope);
    let unique = false;
    const inspect = (node: ts.Node) => {
      if (
        node !== scope &&
        (ts.isMethodDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node))
      )
        return;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'toHaveCount' &&
        node.arguments[0] &&
        ts.isNumericLiteral(node.arguments[0]) &&
        node.arguments[0].text === '1'
      ) {
        const expectation = node.expression.expression;
        if (
          ts.isCallExpression(expectation) &&
          ts.isIdentifier(expectation.expression) &&
          expectation.expression.text === 'expect' &&
          expectation.arguments[0] &&
          expressions.has(expectation.arguments[0].getText(file))
        )
          unique = true;
      }
      ts.forEachChild(node, inspect);
    };
    inspect(scope);
    if (!unique)
      throw new AppError(
        422,
        'Repaired locator requires an existing uniqueness assertion in the same scope',
      );
  }
  let after = before;
  for (const node of matches.sort((a, b) => b.getStart(file) - a.getStart(file)))
    after = after.slice(0, node.getStart(file)) + JSON.stringify(newValue) + after.slice(node.end);
  validateGeneratedFile(path, after);
  return { after, occurrences: matches.length };
}
