import { transcriptionCapabilities } from './transcription.ts';
import type { FastifyInstance } from 'fastify';
import type { RecordingManager } from './manager.ts';
import type { CapturePolicy, Recording, TranscriptSegment } from './model.ts';
const str = (maxLength = 2048) => ({ type: 'string', maxLength });
const number = { type: 'number' };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const strings = { type: 'array', maxItems: 16, items: str(256) };
export function recordingRoutes(app: FastifyInstance, manager: RecordingManager) {
  const control = (host: string | undefined) => 'http://' + host;
  app.get('/api/recordings', async () => ({
    recordings: manager.repository.list(),
    transcription: transcriptionCapabilities,
  }));
  app.post<{ Body: { name: string; policy: CapturePolicy } }>(
    '/api/recordings',
    {
      schema: {
        body: object({
          name: { type: 'string', minLength: 1, maxLength: 120 },
          policy: object({
            url: str(),
            allowedOrigins: strings,
            screenshots: { type: 'boolean' },
            maskSelectors: strings,
            sensitiveQueryKeys: strings,
            retentionDays: { type: 'integer', minimum: 1, maximum: 365 },
            audioRetentionDays: { type: 'integer', minimum: 1, maximum: 30 },
            audioConsent: { type: 'boolean' },
          }),
        }),
      },
    },
    async (req) => manager.start(req.body, control(req.headers.host)),
  );
  app.get<{ Params: { id: string }; Querystring: { after?: number } }>(
    '/api/recordings/:id',
    { schema: { querystring: object({ after: { type: 'integer', minimum: 0 } }, []) } },
    async (req) => ({
      recording: manager.repository.get(req.params.id),
      events: manager.repository.events(req.params.id, Number(req.query.after || 0)),
    }),
  );
  app.post<{ Params: { id: string }; Body: { cancel: boolean; lastSequence?: number } }>(
    '/api/recordings/:id/stop',
    {
      schema: {
        body: object(
          {
            cancel: { type: 'boolean' },
            lastSequence: { type: 'integer', minimum: -1, maximum: 2000 },
          },
          ['cancel'],
        ),
      },
    },
    async (req) => manager.stop(req.params.id, req.body.cancel, req.body.lastSequence),
  );
  app.post<{ Params: { id: string }; Body: { url: string } }>(
    '/api/recordings/:id/navigate',
    { schema: { body: object({ url: str() }) } },
    async (req) => manager.navigate(req.params.id, req.body.url, control(req.headers.host)),
  );
  app.post<{ Params: { id: string }; Body: { origin: string } }>(
    '/api/recordings/:id/origins',
    { schema: { body: object({ origin: str() }) } },
    async (req) => manager.allowOrigin(req.params.id, req.body.origin, control(req.headers.host)),
  );
  app.post<{ Params: { id: string }; Body: { clientMs: number } }>(
    '/api/recordings/:id/clock',
    { schema: { body: object({ clientMs: number }) } },
    async (req) => ({ ...manager.clock(req.params.id), clientMs: req.body.clientMs }),
  );
  app.post<{ Params: { id: string }; Body: { status: Recording['microphone'] } }>(
    '/api/recordings/:id/microphone',
    {
      schema: {
        body: object({
          status: { type: 'string', enum: ['OFF', 'RECORDING', 'STOPPED', 'DENIED', 'ERROR'] },
        }),
      },
    },
    async (req) => manager.microphone(req.params.id, req.body.status),
  );
  app.post<{ Params: { id: string }; Body: Parameters<RecordingManager['audio']>[1] }>(
    '/api/recordings/:id/audio',
    {
      schema: {
        body: object({
          sequence: { type: 'integer' },
          startMs: number,
          endMs: number,
          sourceEndMs: number,
          offsetMs: number,
          uncertaintyMs: number,
          mime: str(80),
          base64: str(700000),
        }),
      },
    },
    async (req) => manager.audio(req.params.id, req.body),
  );
  app.post<{ Params: { id: string }; Body: { detail: string } }>(
    '/api/recordings/:id/gaps',
    { schema: { body: object({ detail: str(300) }) } },
    async (req) => manager.audioGap(req.params.id, req.body.detail),
  );
  app.put<{
    Params: { id: string };
    Body: { segments: TranscriptSegment[]; baseRevision: number };
  }>(
    '/api/recordings/:id/transcript',
    {
      schema: {
        body: object({
          baseRevision: { type: 'integer', minimum: 0 },
          segments: {
            type: 'array',
            maxItems: 200,
            items: object({ startMs: number, endMs: number, text: str(4000) }),
          },
        }),
      },
    },
    async (req) => manager.transcript(req.params.id, req.body.segments, req.body.baseRevision),
  );
  app.get<{ Params: { id: string; name: string } }>(
    '/api/recordings/:id/artifacts/:name',
    async (req, reply) => {
      const { artifact, bytes } = manager.repository.read(req.params.id, req.params.name);
      return reply
        .header('Content-Disposition', `attachment; filename="${artifact.name}"`)
        .header('Content-Security-Policy', "sandbox; default-src 'none'")
        .type('application/octet-stream')
        .send(bytes);
    },
  );
}
