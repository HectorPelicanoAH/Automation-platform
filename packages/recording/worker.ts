import { BrowserCapture } from './capture.ts';
import type { CapturePolicy } from './model.ts';
let capture: BrowserCapture | undefined;
let starting: Promise<unknown> | undefined;
let stopping = false;
const send = (message: object) => {
  if (process.connected) process.send?.(message, () => {});
};
const disconnect = () => {
  if (process.connected) process.disconnect();
};
process.on(
  'message',
  async (message: {
    command: string;
    policy?: CapturePolicy;
    baseMs?: number;
    url?: string;
    origin?: string;
  }) => {
    try {
      if (message.command === 'start' && !capture && message.policy && message.baseMs) {
        capture = new BrowserCapture(
          message.policy,
          message.baseMs,
          (event, screenshot) =>
            send({ type: 'event', event, screenshot: screenshot?.toString('base64') }),
          () => {
            send({ type: 'closed' });
            void capture?.stop().finally(() => process.exit(0));
          },
        );
        starting = capture.start(false);
        await starting;
        if (!stopping) send({ type: 'ready' });
      } else if (message.command === 'stop') {
        stopping = true;
        await capture?.stop();
        await starting?.catch(() => {});
        send({ type: 'stopped' });
        disconnect();
      } else if (message.command === 'navigate' && message.url)
        await capture?.navigate(message.url);
      else if (message.command === 'origin' && message.origin)
        capture?.policy.allowedOrigins.push(message.origin);
    } catch {
      if (!stopping)
        send({
          type: 'error',
          message:
            'Browser capture operation failed; inspect URL, masking selectors, Chromium and GUI availability',
        });
      if (message.command === 'start' && !stopping) {
        await capture?.stop();
        disconnect();
      }
    }
  },
);
process.on('disconnect', () => {
  void capture?.stop().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  stopping = true;
  void capture?.stop().finally(() => process.exit(0));
});
