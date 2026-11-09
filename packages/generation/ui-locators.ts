import ts from 'typescript';
import { AppError } from '../domain/model.ts';

const queryNames = new Set(['getByRole', 'getByLabel', 'getByTestId', 'getByText', 'locator']);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
export const normalizedSource = (node: ts.Node, file: ts.SourceFile) =>
  printer.printNode(ts.EmitHint.Unspecified, node, file);
const compact = normalizedSource;
export function locatorCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    queryNames.has(node.expression.name.text)
  );
}
function owner(node: ts.Node): ts.ClassDeclaration | ts.ClassExpression | undefined {
  for (let p: ts.Node | undefined = node; p; p = p.parent)
    if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p;
}
export function locatorBinding(site: ts.CallExpression, file: ts.SourceFile) {
  for (let p: ts.Node = site; p.parent; p = p.parent) {
    if (
      ts.isBinaryExpression(p.parent) &&
      p.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(p.parent.left) &&
      p.parent.left.expression.kind === ts.SyntaxKind.ThisKeyword
    )
      return compact(p.parent.left, file);
    if (ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name))
      return p.parent.name.text;
    if (ts.isMethodDeclaration(p.parent) || ts.isConstructorDeclaration(p.parent)) break;
  }
}
// Match a property/factory and local aliases of it; another element's count is never evidence.
export function uniquenessSites(scope: ts.Node, expression: string, file: ts.SourceFile): number[] {
  if (ts.isClassDeclaration(scope) || ts.isClassExpression(scope))
    return scope.members
      .filter(ts.isMethodDeclaration)
      .flatMap((method) => uniquenessSites(method, expression, file));
  const key = (node: ts.Node): string =>
    ts.isCallExpression(node) ? compact(node.expression, file) : compact(node, file);
  const names = new Set([expression]);
  const aliases = (node: ts.Node) => {
    if (node !== scope && ts.isFunctionLike(node)) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      names.has(key(node.initializer))
    )
      names.add(node.name.text);
    ts.forEachChild(node, aliases);
  };
  aliases(scope);
  const positions: number[] = [];
  const visit = (node: ts.Node) => {
    if (node !== scope && ts.isFunctionLike(node)) return;
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
        expectation.expression.getText(file) === 'expect' &&
        expectation.arguments[0] &&
        names.has(key(expectation.arguments[0]))
      ) {
        let p: ts.Node = node;
        while (p.parent && !ts.isExpressionStatement(p)) p = p.parent;
        if (ts.isExpressionStatement(p) && ts.isAwaitExpression(p.expression))
          positions.push(node.getStart(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return positions;
}

/** Conservative generation checks, never a claim that a locator matched a live DOM. */
export function validateNewPageLocators(path: string, before: string | null, after: string) {
  if (!/^ui\/(pages|components)\//.test(path)) return;
  const file = ts.createSourceFile(path, after, ts.ScriptTarget.Latest, true);
  const old =
    before === null ? undefined : ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true);
  const oldMembers = new Set<string>();
  const memberKey = (node: ts.Node, source: ts.SourceFile) => {
    let p: ts.Node | undefined = node;
    while (p && !ts.isMethodDeclaration(p) && !ts.isConstructorDeclaration(p)) p = p.parent;
    return p
      ? `${owner(p)?.name?.text}:${ts.isConstructorDeclaration(p) ? 'constructor' : (p as ts.MethodDeclaration).name.getText(source)}:${locatorBinding(node as ts.CallExpression, source)}:${compact(node, source)}`
      : '';
  };
  if (old) {
    const collect = (n: ts.Node) => {
      if (locatorCall(n)) oldMembers.add(memberKey(n, old));
      ts.forEachChild(n, collect);
    };
    collect(old);
  }
  const visit = (node: ts.Node) => {
    if (locatorCall(node) && !oldMembers.has(memberKey(node, file))) {
      let ctor: ts.Node | undefined = node;
      while (ctor && !ts.isConstructorDeclaration(ctor) && !ts.isMethodDeclaration(ctor))
        ctor = ctor.parent;
      const binding = locatorBinding(node, file);
      const cls = owner(node);
      const property = cls?.members.find(
        (m) => ts.isPropertyDeclaration(m) && binding === 'this.' + m.name.getText(file),
      );
      if (
        !ctor ||
        !ts.isConstructorDeclaration(ctor) ||
        !property ||
        !ts.isPropertyDeclaration(property) ||
        !property.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ||
        !property.type ||
        !/\bLocator\b/.test(property.type.getText(file))
      )
        throw new AppError(
          422,
          'New Page/component locators must be typed readonly fields or locator factories initialized in the constructor',
        );
      const method = (node.expression as ts.PropertyAccessExpression).name.text;
      const documentRoot =
        method === 'locator' &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        node.arguments[0].text === 'html';
      if (!documentRoot) {
        if (method === 'locator')
          throw new AppError(
            422,
            'Only the document html locator is permitted for language detection; other CSS needs manual review',
          );
        const options = node.arguments[1];
        if (method !== 'getByTestId') {
          const props = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
          const named =
            method !== 'getByRole' ||
            props.some((p) => ts.isPropertyAssignment(p) && p.name.getText(file) === 'name');
          const exact = props.some(
            (p) =>
              ts.isPropertyAssignment(p) &&
              p.name.getText(file) === 'exact' &&
              p.initializer.kind === ts.SyntaxKind.TrueKeyword,
          );
          if (named && !exact)
            throw new AppError(422, 'Named role, label and text locators require exact: true');
          if (
            node.arguments.some((arg) => ts.isRegularExpressionLiteral(arg)) ||
            props.some(
              (p) => ts.isPropertyAssignment(p) && ts.isRegularExpressionLiteral(p.initializer),
            )
          )
            throw new AppError(
              422,
              'Broad/regex locator names require manual review; use an observed exact locale-specific label',
            );
          const receiver = (node.expression as ts.PropertyAccessExpression).expression;
          const scopedField =
            ts.isPropertyAccessExpression(receiver) &&
            receiver.expression.kind === ts.SyntaxKind.ThisKeyword &&
            cls?.members.some(
              (m) =>
                ts.isPropertyDeclaration(m) &&
                m.name.getText(file) === receiver.name.text &&
                m.type &&
                /\bLocator\b/.test(m.type.getText(file)),
            );
          if (!named && !scopedField)
            throw new AppError(422, 'Unnamed roles require an explicit reusable component scope');
        }
        if (!cls || !binding || !uniquenessSites(cls, binding, file).length)
          throw new AppError(
            422,
            'Each new locator needs its own awaited toHaveCount(1) check; unrelated counts do not prove uniqueness',
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

export function constructorExtends(before: string, after: string, path: string) {
  const parse = (text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const old = parse(before),
    next = parse(after);
  const constructors = (file: ts.SourceFile) => {
    const map = new Map<string, ts.ConstructorDeclaration>();
    const walk = (n: ts.Node) => {
      if (ts.isConstructorDeclaration(n)) map.set(owner(n)?.name?.text || 'anonymous', n);
      ts.forEachChild(n, walk);
    };
    walk(file);
    return map;
  };
  const result = new Set<string>();
  for (const [name, previous] of constructors(old)) {
    const current = constructors(next).get(name);
    if (
      !current?.body ||
      !previous.body ||
      previous.parameters.map((p) => compact(p, old)).join(',') !==
        current.parameters.map((p) => compact(p, next)).join(',')
    )
      continue;
    const a = previous.body.statements,
      b = current.body.statements;
    if (
      !a.every(
        (statement, index) => b[index] && compact(statement, old) === compact(b[index], next),
      )
    )
      continue;
    const cls = owner(current)!;
    const added = b.slice(a.length);
    if (
      added.every((statement) => {
        if (
          !ts.isExpressionStatement(statement) ||
          !ts.isBinaryExpression(statement.expression) ||
          statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        )
          return false;
        const assignment = statement.expression;
        if (
          !ts.isPropertyAccessExpression(assignment.left) ||
          assignment.left.expression.kind !== ts.SyntaxKind.ThisKeyword
        )
          return false;
        const property = cls.members.find(
          (m) =>
            ts.isPropertyDeclaration(m) &&
            m.name.getText(next) === (assignment.left as ts.PropertyAccessExpression).name.text,
        );
        let hasLocator = false;
        const scan = (n: ts.Node) => {
          if (locatorCall(n)) hasLocator = true;
          ts.forEachChild(n, scan);
        };
        scan(assignment.right);
        const priorClass = owner(previous)!;
        const fieldName = (assignment.left as ts.PropertyAccessExpression).name.text;
        const alreadyDeclared =
          priorClass.members.some((m) => m.name?.getText(old) === fieldName) ||
          previous.parameters.some((p) => p.name.getText(old) === fieldName);
        return (
          !alreadyDeclared &&
          hasLocator &&
          property &&
          ts.isPropertyDeclaration(property) &&
          property.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) &&
          !previous.body!.statements.some(
            (s) =>
              ts.isExpressionStatement(s) &&
              ts.isBinaryExpression(s.expression) &&
              compact(s.expression.left, old) === compact(assignment.left, next),
          )
        );
      })
    )
      result.add(name + ':constructor');
  }
  return result;
}
