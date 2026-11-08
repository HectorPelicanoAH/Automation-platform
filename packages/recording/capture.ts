import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Frame,
  type Locator,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { OBSERVER_SCRIPT } from './observer.ts';
import {
  monotonicMs,
  RECORDING_LIMITS,
  type CapturePolicy,
  type EvidenceEvent,
  type LocatorEvidence,
} from './model.ts';
import { safeText, safeUrl, recordingUrl, controlOrigin } from './privacy.ts';

type CapturedEvent = Omit<EvidenceEvent, 'sequence' | 'receivedMs'>;
export class BrowserCapture {
  browser?: Browser;
  context?: BrowserContext;
  private stopped = false;
  private pages = new WeakMap<Page, string>();
  private frames = new WeakMap<Frame, string>();
  private pageCount = 0;
  private frameCount = 0;
  private pending = Promise.resolve();
  private queued = 0;
  private lastScreenshot = -Infinity;
  private observedIds = new Set<string>();
  private contextTasks = new Map<string, Promise<void>>();
  private beaconPath = '/__qa_observation_' + randomUUID().replaceAll('-', '');
  private recent: number[] = [];
  private lastLimitGap = -Infinity;
  private limited(detail: string) {
    if (this.time() - this.lastLimitGap > 1000) {
      this.lastLimitGap = this.time();
      this.event('gap', detail);
    }
  }
  constructor(
    readonly policy: CapturePolicy,
    readonly baseMs: number,
    readonly emit: (event: CapturedEvent, screenshot?: Buffer) => void,
    readonly disconnected: () => void = () => {},
  ) {}
  time() {
    return monotonicMs() - this.baseMs;
  }
  private ids(page: Page, frame?: Frame) {
    if (!this.pages.has(page)) this.pages.set(page, randomUUID());
    if (frame && !this.frames.has(frame)) {
      this.frames.set(frame, randomUUID());
      this.frameCount++;
    }
    return { pageId: this.pages.get(page), frameId: frame ? this.frames.get(frame) : undefined };
  }
  private blockedControl(url: string) {
    if (!this.policy.controlOrigin) return false;
    try {
      const candidate = new URL(url);
      if (candidate.protocol === 'ws:') candidate.protocol = 'http:';
      if (candidate.protocol === 'wss:') candidate.protocol = 'https:';
      return controlOrigin(candidate.href, this.policy.controlOrigin);
    } catch {
      return true;
    }
  }
  private allowed(url: string) {
    try {
      return !this.blockedControl(url) && this.policy.allowedOrigins.includes(new URL(url).origin);
    } catch {
      return false;
    }
  }
  private event(kind: EvidenceEvent['kind'], detail: string, page?: Page, frame?: Frame) {
    this.emit({
      kind,
      detail,
      timeMs: this.time(),
      provenance: 'OBSERVED',
      ...(page ? this.ids(page, frame) : {}),
    });
  }
  async start(headless = false) {
    this.browser = await chromium.launch({ headless, timeout: 15000 });
    if (this.stopped) {
      await this.browser.close();
      throw new Error('Capture cancelled during startup');
    }
    this.browser.on('disconnected', () => {
      if (!this.stopped) this.disconnected();
    });
    this.context = await this.browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
      viewport: { width: 1280, height: 900 },
    });
    await this.context.route('**/*', async (route) => {
      if (new URL(route.request().url()).pathname === this.beaconPath) {
        try {
          const request = route.request();
          const body = request.postData() || '';
          if (
            this.allowed(request.url()) &&
            request.method() === 'POST' &&
            Buffer.byteLength(body) <= 8000
          ) {
            const frame = request.frame();
            this.queueObservation(frame.page(), frame, JSON.parse(body));
          }
        } catch {
          this.limited('Unload observation unavailable; evidence may be incomplete');
        }
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const request = route.request();
      const url = new URL(request.url());
      let topNavigation = request.isNavigationRequest();
      if (topNavigation) {
        try {
          topNavigation = !request.frame().parentFrame();
        } catch {
          // A popup can request its document before Playwright exposes its Frame.
          // Keep the stricter navigation grant until a frame is available.
        }
      }
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !this.blockedControl(url.href) &&
        (!topNavigation || this.allowed(url.href))
      ) {
        // Loading a resource does not authorize observing its origin or persisting its data.
        await route.continue();
      } else {
        this.event(
          'gap',
          (this.blockedControl(url.href)
            ? 'Blocked platform control origin: '
            : 'Blocked unapproved navigation: ') + safeUrl(url.href),
        );
        await route.abort('blockedbyclient');
      }
    });
    await this.context.routeWebSocket('**/*', (socket) => {
      if (this.blockedControl(socket.url())) {
        void socket.close();
        this.event('gap', 'Blocked platform control WebSocket');
      } else {
        socket.connectToServer();
        this.limited('WebSocket connection permitted; messages are not captured');
      }
    });
    this.context.on('response', (response) => {
      if (
        !this.allowed(response.url()) ||
        this.stopped ||
        new URL(response.url()).pathname === this.beaconPath
      )
        return;
      const now = this.time();
      this.recent = this.recent.filter((t) => now - t < 1000);
      if (this.recent.length >= 20) {
        this.limited('Network event rate exceeded; some metadata omitted');
        return;
      }
      this.recent.push(now);
      const request = response.request();
      let frame: Frame | undefined;
      try {
        frame = request.frame();
      } catch {
        /* service worker omitted */
      }
      this.emit({
        kind: 'network',
        detail: `${request.method().slice(0, 12)} ${response.status()} ${request.resourceType()}`,
        url: safeUrl(response.url()),
        timeMs: now,
        provenance: 'OBSERVED',
        ...(frame ? this.ids(frame.page(), frame) : {}),
      });
    });
    const binding = '__qaObserve_' + randomUUID().replaceAll('-', '');
    await this.context.exposeBinding(binding, ({ page, frame }, raw: unknown) => {
      if (!this.allowed(frame.url()) || this.stopped) return { timeMs: this.time() };
      if (!raw || typeof raw !== 'object' || Buffer.byteLength(JSON.stringify(raw)) > 8000)
        return { timeMs: this.time() };
      const input = raw as Record<string, unknown>;
      if (input.kind === 'sync') return { timeMs: this.time() };
      return this.queueObservation(page, frame, input).then(() => ({ timeMs: this.time() }));
    });
    await this.context.addInitScript({
      content: `(${OBSERVER_SCRIPT})(${JSON.stringify({ binding, beaconPath: this.beaconPath, maskSelectors: this.policy.maskSelectors })})`,
    });
    this.context.on('page', (page) => this.attach(page));
    const page = await this.context.newPage();
    await page.evaluate((selectors) => {
      for (const selector of selectors) document.querySelector(selector);
    }, this.policy.maskSelectors);
    await page.goto(this.policy.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    return page;
  }
  private queueObservation(page: Page, frame: Frame, raw: unknown) {
    if (!raw || typeof raw !== 'object' || this.stopped) return Promise.resolve();
    const input = raw as Record<string, unknown>;
    const id = typeof input.eventId === 'string' ? input.eventId : undefined;
    if (id && this.observedIds.has(id)) return this.contextTasks.get(id) || Promise.resolve();
    if (id && (id.length > 100 || this.observedIds.size >= RECORDING_LIMITS.events)) {
      this.limited('Observation identity budget reached');
      return Promise.resolve();
    }
    const base = this.basicEvent(page, frame, input);
    if (!base) return Promise.resolve();
    if (id) {
      this.observedIds.add(id);
      base.sourceEventId = id;
    }
    if (input.backupUnavailable)
      this.limited('Unload backup unavailable; fast navigation can lose observation evidence');
    // Persist observed intent before any DOM/ARIA/screenshot work. Enrichment must never block the action stream.
    this.emit(base);
    if (!input.target) return Promise.resolve();
    if (this.frameCount > RECORDING_LIMITS.frames || this.queued >= 30) {
      this.limited('Frame/context backlog exceeded; detailed evidence omitted');
      return Promise.resolve();
    }
    this.queued++;
    this.pending = this.pending
      .then(async () => {
        let expired = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const publish = (event: CapturedEvent, image?: Buffer) => {
          if (!expired && !this.stopped)
            this.emit(
              { ...event, kind: 'context', timeMs: this.time(), evidenceAtMs: this.time() },
              image,
            );
        };
        try {
          await Promise.race([
            this.captureContext(
              page,
              frame,
              input,
              { ...base, detail: 'Context for ' + base.detail },
              publish,
              () => !expired && !this.stopped,
            ),
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                expired = true;
                if (!this.stopped)
                  this.emit({
                    ...base,
                    kind: 'gap',
                    timeMs: this.time(),
                    detail: 'Detailed context deadline exceeded; observed action retained',
                  });
                resolve();
              }, 4000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          expired = true;
        }
      })
      .catch(() =>
        this.event('gap', 'Detailed evidence unavailable during navigation', page, frame),
      )
      .finally(() => {
        this.queued--;
        if (id) this.contextTasks.delete(id);
      });
    if (id) this.contextTasks.set(id, this.pending);
    return this.pending;
  }
  private attach(page: Page) {
    if (++this.pageCount > RECORDING_LIMITS.pages) {
      this.event('gap', 'Page limit exceeded');
      void page.close();
      return;
    }
    this.event('page', 'Browser page opened', page, page.mainFrame());
    page.on('framenavigated', (frame) => {
      if (this.allowed(frame.url()))
        this.emit({
          kind: 'navigation',
          detail: frame === page.mainFrame() ? 'Document navigation' : 'Frame navigation',
          url: safeUrl(frame.url()),
          timeMs: this.time(),
          provenance: 'OBSERVED',
          ...this.ids(page, frame),
        });
      else if (frame.url() !== 'about:blank')
        this.event('gap', 'Unapproved/non-HTTP frame navigation omitted', page, frame);
    });
    page.on('close', () => {
      this.event('page', 'Browser page closed', page);
      if (!this.stopped && this.context?.pages().length === 0) this.disconnected();
    });
    page.on('dialog', (dialog) => {
      this.event('gap', 'Native dialog requires manual handling; recorder dismissed it', page);
      void dialog.dismiss();
    });
    page.on('download', (download) => {
      this.event('gap', 'Downloads unsupported; contents not retained', page);
      void download.cancel();
    });
    page.on('filechooser', () => this.event('gap', 'File chooser content is not recorded', page));
  }
  private basicEvent(
    page: Page,
    frame: Frame,
    input: Record<string, unknown>,
  ): CapturedEvent | undefined {
    if (this.stopped) return;
    const kinds = ['action', 'navigation', 'clock', 'gap', 'page'];
    if (!kinds.includes(String(input.kind))) return;
    const { sourceMs, offsetMs, uncertaintyMs } = input;
    if (
      ![sourceMs, offsetMs, uncertaintyMs].every((n) => typeof n === 'number' && Number.isFinite(n))
    )
      return;
    if ((uncertaintyMs as number) < 0 || (uncertaintyMs as number) > 5000) return;
    const timeMs = (sourceMs as number) + (offsetMs as number);
    if (timeMs < -1000 || Math.abs(timeMs - this.time()) > 30_000) return;
    const event: CapturedEvent = {
      kind: input.kind as EvidenceEvent['kind'],
      detail: safeText(String(input.detail || 'Browser clock calibration')).slice(0, 120),
      timeMs: Math.max(0, timeMs),
      sourceMs: sourceMs as number,
      offsetMs: offsetMs as number,
      uncertaintyMs: uncertaintyMs as number,
      documentLanguage:
        typeof input.documentLanguage === 'string' &&
        /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(input.documentLanguage) &&
        input.documentLanguage.length <= 64
          ? input.documentLanguage
          : undefined,
      producer: 'browser',
      provenance: 'OBSERVED',
      url: safeUrl(typeof input.documentUrl === 'string' ? input.documentUrl : frame.url()),
      ...this.ids(page, frame),
    };
    return event;
  }
  private async captureContext(
    page: Page,
    frame: Frame,
    input: Record<string, unknown>,
    event: CapturedEvent,
    publish: (event: CapturedEvent, image?: Buffer) => void,
    current: () => boolean,
  ) {
    try {
      const rawTarget = input.target as Record<string, unknown> | undefined;
      if (
        rawTarget &&
        typeof rawTarget.token === 'string' &&
        /^[a-z0-9-]{1,80}$/.test(rawTarget.token)
      ) {
        const target = frame.locator(`[data-qa-observation="${rawTarget.token}"]`);
        if ((await target.count()) === 1) {
          const secrets = await frame
            .locator('input,textarea,[contenteditable=true]')
            .evaluateAll((elements) =>
              elements
                .map((e) => (e as HTMLInputElement).value || e.textContent || '')
                .filter(Boolean)
                .slice(0, 256),
            );
          const clean = (v: unknown) => safeText(String(v || ''), secrets).slice(0, 500);
          const tag = clean(rawTarget.tag);
          const role = clean(rawTarget.role);
          const name = clean(rawTarget.name);
          event.dom = `<${tag} role=${JSON.stringify(role)} accessibleName=${JSON.stringify(name)}> (values/text omitted)`;
          const candidates: { evidence: LocatorEvidence; locator: Locator }[] = [];
          const add = (
            kind: LocatorEvidence['kind'],
            value: string,
            locator: Locator,
            name?: string,
          ) =>
            candidates.push({
              evidence: { kind, value, name, count: 0, matchesTarget: false },
              locator,
            });
          if (!rawTarget.private) {
            if (role && name)
              add(
                'role',
                role,
                frame.getByRole(role as Parameters<Frame['getByRole']>[0], { name, exact: true }),
                name,
              );
            if (rawTarget.label)
              add(
                'label',
                clean(rawTarget.label),
                frame.getByLabel(clean(rawTarget.label), { exact: true }),
              );
            if (rawTarget.testId)
              add('testId', clean(rawTarget.testId), frame.getByTestId(clean(rawTarget.testId)));
            if (rawTarget.id)
              add(
                'id',
                clean(rawTarget.id),
                frame.locator(`[id=${JSON.stringify(clean(rawTarget.id))}]`),
              );
          }
          for (const c of candidates) {
            c.evidence.count = await c.locator.count();
            c.evidence.matchesTarget =
              c.evidence.count === 1 &&
              (await c.locator.evaluate(
                (element, token) => element.getAttribute('data-qa-observation') === token,
                rawTarget.token,
              ));
          }
          event.locators = candidates.map((c) => c.evidence);
          if (
            !rawTarget.private &&
            !['input', 'select', 'textarea'].includes(tag) &&
            (await target.locator('input,textarea,select,[contenteditable]').count()) === 0 &&
            !(await target.evaluate((el) => el.hasAttribute('contenteditable')))
          )
            event.aria = clean(
              (await target.ariaSnapshot({ timeout: 1000 }))
                .split('\n')
                .filter((line) => !line.includes('/url:'))
                .join('\n'),
            );
          else event.aria = 'Form/private value omitted';
          // A screenshot is acquired later than the action and never implies its expected outcome.
          if (
            this.policy.screenshots &&
            this.time() - this.lastScreenshot > 1000 &&
            frame === page.mainFrame()
          ) {
            this.lastScreenshot = this.time();
            const mask = [
              page.locator(
                'input,textarea,select,[contenteditable],[data-private],[data-sensitive],iframe',
              ),
              ...this.policy.maskSelectors.map((s) => page.locator(s)),
            ];
            const screenshot = await page.screenshot({
              type: 'png',
              mask,
              timeout: 3000,
            });
            if (screenshot.length > RECORDING_LIMITS.artifactBytes) {
              if (current())
                this.event('gap', 'Screenshot exceeds artifact budget; image omitted', page, frame);
              publish(event);
              return;
            }
            event.evidenceAtMs = this.time();
            publish(event, screenshot);
            return;
          }
        } else {
          event.dom = 'Target detached before evidence capture';
        }
      }
    } catch {
      event.dom = 'Detailed evidence unavailable after navigation/detachment';
      if (current())
        this.event(
          'gap',
          'Action observed but its target evidence could not be completed',
          page,
          frame,
        );
    }
    publish(event);
  }
  async navigate(url: string) {
    const next = recordingUrl(url);
    if (!this.allowed(next.href)) throw new Error('Origin must be approved before navigation');
    const page = this.context?.pages()[0];
    if (!page) throw new Error('Browser is not available');
    await page.goto(next.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  }
  async stop() {
    if (this.stopped) return;
    await Promise.race([this.pending, new Promise((r) => setTimeout(r, 4000))]);
    this.stopped = true;
    await this.browser?.close();
  }
}
