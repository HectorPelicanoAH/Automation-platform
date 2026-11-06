// Kept as plain browser JavaScript: no transpiler helpers or imported page instructions.
export const OBSERVER_SCRIPT = String.raw`(config) => {
  const binding = window[config.binding];
  let calibration = null;
  let serial = 0;
  let eventNumber=0;const documentId=Math.random().toString(36).slice(2);
  const secrets = () => Array.from(document.querySelectorAll('input,textarea,[contenteditable=true]')).map(e => e.value || e.textContent || '').filter(Boolean).slice(0,256);
  const clean = value => {
    let result = String(value || '').slice(0,500);
    for (const secret of secrets()) if (secret.length >= 2) result = result.split(secret).join('[REDACTED]');
    return result.replace(/[A-Za-z0-9_+/=-]{48,}/g,'[REDACTED]');
  };
  const sync = async () => {
    const before = performance.now();
    const remote = await binding({kind:'sync'});
    const after = performance.now();
    const next = {offsetMs:remote.timeMs-(before+after)/2,uncertaintyMs:(after-before)/2};
    calibration = next;
    await binding({kind:'clock',sourceMs:after,...next});
  };
  const ready = sync().catch(() => {});
  setInterval(() => void sync().catch(() => {}),30000);
  const send = async (kind,detail,element) => {
    const sourceMs = performance.now();
    if (!calibration) await ready;
    if (!calibration) return;
    const payload = {kind,detail,sourceMs,...calibration,eventId:documentId+'-'+(++eventNumber),documentUrl:location.href};
    if (element instanceof Element) {
      const el = element.closest('button,a,input,select,textarea,[role],[contenteditable=true]') || element;
      const token = 'q'+(++serial)+'-'+Math.random().toString(36).slice(2);
      el.setAttribute('data-qa-observation',token);
      const privateNode = el.closest('[data-private],[data-sensitive],input[type=password],input[type=hidden]') || el.querySelector('[data-private],[data-sensitive],input[type=password],input[type=hidden]') || config.maskSelectors.some(s => el.matches(s)||el.closest(s)||el.querySelector(s));
      const roles = {BUTTON:'button',A:'link',SELECT:'combobox',TEXTAREA:'textbox'};
      let role = el.getAttribute('role') || roles[el.tagName] || (el.tagName==='INPUT' ? (['checkbox','radio'].includes(el.type)?el.type:'textbox') : '');
      const label = el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || '';
      const name = label || (['BUTTON','A','OPTION'].includes(el.tagName) ? el.textContent : '') || '';
      payload.target={token,tag:el.tagName.toLowerCase(),role:clean(role),name:privateNode?'[REDACTED]':clean(name),label:privateNode?'':clean(label),testId:privateNode?'':clean(el.getAttribute('data-testid')),id:privateNode?'':clean(el.id),private:!!privateNode};
      // Values and keystrokes are deliberately excluded, including ordinary free text.
      if(el.tagName==='CANVAS'||el.tagName==='IFRAME') {payload.kind='gap';payload.detail='Unsupported interaction surface: '+el.tagName.toLowerCase();}
      try { if(!navigator.sendBeacon(new URL(config.beaconPath,location.origin).href,JSON.stringify(payload)))payload.backupUnavailable=true; } catch {payload.backupUnavailable=true;}
      try { await binding(payload); } finally { if(el.getAttribute('data-qa-observation')===token) el.removeAttribute('data-qa-observation'); }
    } else await binding(payload);
  };
  document.addEventListener('click',e=>{if(e.isTrusted)void send('action','click',e.composedPath()[0]).catch(()=>{});},true);
  const edits=new Map();const completed=new WeakSet();
  document.addEventListener('input',e=>{if(!e.isTrusted)return;const el=e.target;clearTimeout(edits.get(el));completed.delete(el);if(edits.size>=128){void send('gap','Edit backlog limit; evidence omitted').catch(()=>{});return;}edits.set(el,setTimeout(()=>{edits.delete(el);completed.add(el);void send('action','fill/change (value omitted)',el).catch(()=>{});},300));},true);
  document.addEventListener('change',e=>{if(!e.isTrusted)return;clearTimeout(edits.get(e.target));edits.delete(e.target);if(completed.has(e.target)){completed.delete(e.target);return;}void send('action',e.target.tagName==='SELECT'?'select (value omitted)':'fill/change (value omitted)',e.target).catch(()=>{});},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){for(const [el,timer] of edits){clearTimeout(timer);completed.add(el);void send('action','fill/change (value omitted)',el).catch(()=>{});}edits.clear();}});

  document.addEventListener('submit',e=>{if(e.isTrusted)void send('action','submit',e.target).catch(()=>{});},true);
  document.addEventListener('keydown',e=>{if(e.isTrusted&&['Enter',' '].includes(e.key))void send('action','keyboard activation',e.target).catch(()=>{});},true);
  for(const name of ['pushState','replaceState']) {
    const original=history[name];history[name]=function(...args){const result=original.apply(this,args);void send('navigation','SPA '+name).catch(()=>{});return result;};
  }
  for(const name of ['popstate','hashchange'])addEventListener(name,()=>void send('navigation','SPA '+name).catch(()=>{}));
  addEventListener('pageshow',()=>void send('page','Document observer ready').catch(()=>{}));
}`;
