// Runs in the observed frame. Only a structural allowlist is serialized; scripts, URLs,
// editable values, private regions and custom masks never enter the saved snapshot.
export function sanitizedDocument(maskSelectors: string[]) {
  const hidden = [
    'script',
    'style',
    'noscript',
    'template',
    'iframe',
    'input',
    'textarea',
    'select',
    '[contenteditable]',
    '[data-private]',
    '[data-sensitive]',
    '[hidden]',
    '[aria-hidden="true"]',
    '[inert]',
    '[data-qa-recorder-indicator]',
    ...maskSelectors,
  ].join(',');
  const attrs = [
    'role',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-expanded',
    'aria-checked',
    'aria-selected',
    'aria-level',
    'data-testid',
    'id',
    'for',
    'alt',
    'title',
    'lang',
  ];
  let count = 0,
    size = 0,
    truncated = false;
  const escape = (v: string) =>
    v
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const visit = (node: Node, depth: number): string => {
    if (++count > 1500 || depth > 24 || size > 6000) {
      truncated = true;
      return '';
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const value = escape((node.textContent || '').replace(/\s+/g, ' ').slice(0, 250));
      size += value.length;
      return value;
    }
    if (!(node instanceof Element) || node.matches(hidden)) return '';
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    const tag = node.tagName.toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) return '';
    const attributes = attrs
      .filter((a) => node.hasAttribute(a))
      .map((a) => ` ${a}="${escape(node.getAttribute(a)!.slice(0, 200))}"`)
      .join('');
    const link = tag === 'a' && node.hasAttribute('href') ? ' href="#"' : '';
    size += tag.length * 2 + attributes.length + link.length + 5;
    let children = '';
    for (let index = 0; index < node.childNodes.length; index++) {
      if (count >= 1500 || size > 6000) {
        truncated = true;
        break;
      }
      children += visit(node.childNodes[index], depth + 1);
    }
    return `<${tag}${attributes}${link}>${children}</${tag}>`;
  };
  return { dom: visit(document.body, 0), language: document.documentElement.lang, truncated };
}
