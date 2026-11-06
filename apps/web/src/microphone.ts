import { api } from './api.ts';

export class MicrophoneCapture {
  private media?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setInterval>;
  private pending = Promise.resolve();
  private offsetMs = 0;
  private uncertaintyMs = 0;
  private startMs = 0;
  private nextSequence = 0;
  private failed = false;
  private queued = 0;
  private stopping = false;
  constructor(
    readonly id: string,
    readonly update: (message: string) => void,
  ) {}
  private async synchronize() {
    const before = performance.now();
    const clock = await api<{ timeMs: number }>(`/recordings/${this.id}/clock`, {
      clientMs: before,
    });
    const after = performance.now();
    this.offsetMs = clock.timeMs - (before + after) / 2;
    this.uncertaintyMs = (after - before) / 2;
  }
  async start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Microphone capture is unavailable in this browser; use manual narration.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (this.stopping) {
        this.stream.getTracks().forEach((t) => t.stop());
        throw new Error('Microphone request cancelled');
      }
      await this.synchronize();
      if (this.stopping) throw new Error('Microphone request cancelled');
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (!mime) throw new Error('No supported microphone recording codec; use manual narration.');
      this.media = new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      this.startMs = performance.now() + this.offsetMs;
      await api(`/recordings/${this.id}/microphone`, { status: 'RECORDING' });
      if (this.stopping) throw new Error('Microphone request cancelled');
      this.media.addEventListener('dataavailable', (event) => {
        const sourceEndMs = performance.now();
        const endMs = sourceEndMs + this.offsetMs;
        const input = {
          sequence: this.nextSequence++,
          startMs: this.startMs,
          endMs,
          sourceEndMs,
          offsetMs: this.offsetMs,
          uncertaintyMs: this.uncertaintyMs,
          mime,
        };
        this.startMs = endMs;
        if (this.queued >= 3) {
          this.failed = true;
          this.update('Audio upload backlog; chunk omitted.');
          return;
        }
        this.queued++;
        this.pending = this.pending
          .then(async () => {
            if (!event.data.size) return;
            if (event.data.size > 512 * 1024) {
              await api(`/recordings/${this.id}/gaps`, {
                detail: `Audio chunk ${input.sequence} exceeded upload limit and was omitted`,
              });
              return;
            }
            const bytes = new Uint8Array(await event.data.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 8192)
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            await api(
              `/recordings/${this.id}/audio`,
              { ...input, base64: btoa(binary) },
              'POST',
              AbortSignal.timeout(5000),
            );
          })
          .catch(() => {
            this.failed = true;
            this.update(
              'Audio upload failed; recording contains a gap. Stop and use manual narration.',
            );
          })
          .finally(() => this.queued--);
      });
      this.media.addEventListener('error', () => {
        this.failed = true;
        this.update('Microphone capture failed; use manual narration.');
        void api(`/recordings/${this.id}/microphone`, { status: 'ERROR' }).catch(() => {});
        this.stream?.getTracks().forEach((t) => t.stop());
      });
      this.stream.getTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (this.media?.state === 'recording') {
            this.failed = true;
            this.update('Microphone track ended unexpectedly.');
            this.media.stop();
          }
        }),
      );
      this.media.start(2000);
      this.timer = setInterval(() => {
        void this.synchronize().catch(() => {
          this.failed = true;
          this.update('Microphone clock calibration unavailable; timing may be uncertain.');
        });
      }, 30000);
      this.update('Microphone recording — raw audio may contain sensitive information.');
    } catch (error) {
      this.stream?.getTracks().forEach((t) => t.stop());
      await api(`/recordings/${this.id}/microphone`, {
        status:
          error instanceof DOMException && error.name === 'NotAllowedError' ? 'DENIED' : 'ERROR',
      }).catch(() => {});
      throw error;
    }
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    if (this.media && this.media.state !== 'inactive')
      await new Promise<void>((resolve) => {
        this.media!.addEventListener('stop', () => resolve(), { once: true });
        this.media!.stop();
      });
    this.stream?.getTracks().forEach((t) => t.stop());
    await Promise.race([
      this.pending,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (this.queued) this.failed = true;
          resolve();
        }, 5500),
      ),
    ]);
    await api(`/recordings/${this.id}/microphone`, {
      status: this.failed ? 'ERROR' : 'STOPPED',
    }).catch(() => {});
    return this.nextSequence - 1;
  }
}
