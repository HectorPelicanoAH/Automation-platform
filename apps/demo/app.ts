import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';

const promotions = [
  {
    countryIso: 'es',
    languageIso: 'es',
    brand: 'demo',
    title: 'Envío gratis',
    discount: '50€',
    subtitle: 'En pedidos superiores a 50€',
    thresholdMinor: 5000,
    currency: 'EUR',
  },
  {
    countryIso: 'pt',
    languageIso: 'pt',
    brand: 'demo',
    title: 'Envio grátis',
    discount: '60€',
    subtitle: 'Em compras superiores a 60€',
    thresholdMinor: 6000,
    currency: 'EUR',
  },
];

export function demoApp(
  options: {
    wrongAmount?: boolean;
    onContextCreated?: (context: {
      id: string;
      countryIso: string;
      languageIso: string;
      brand: string;
    }) => void;
  } = {},
) {
  const app = Fastify();
  const contexts = new Map<
    string,
    { countryIso: string; languageIso: string; brand: string; createdAt: number }
  >();
  const contextSchema = {
    type: 'object',
    required: ['countryIso', 'languageIso', 'brand'],
    additionalProperties: false,
    properties: {
      countryIso: { type: 'string', enum: ['es', 'pt'] },
      languageIso: { type: 'string', enum: ['es', 'pt'] },
      brand: { type: 'string', enum: ['demo'] },
    },
  };
  app.post<{ Body: { countryIso: string; languageIso: string; brand: string } }>(
    '/api/demo/contexts',
    { schema: { body: contextSchema } },
    async (request, reply) => {
      for (const [id, value] of contexts)
        if (Date.now() - value.createdAt > 900000) contexts.delete(id);
      if (contexts.size >= 1000)
        return reply.code(429).send({ error: 'Synthetic context capacity reached' });
      if (
        !promotions.some(
          (p) =>
            p.countryIso === request.body.countryIso &&
            p.languageIso === request.body.languageIso &&
            p.brand === request.body.brand,
        )
      )
        return reply.code(422).send({ error: 'Unsupported synthetic context' });
      const id = randomUUID();
      contexts.set(id, { ...request.body, createdAt: Date.now() });
      options.onContextCreated?.({ id, ...request.body });
      return reply.code(201).send({ id, ...request.body });
    },
  );
  app.get<{ Params: { id: string } }>('/api/demo/contexts/:id', async (request, reply) => {
    const value = contexts.get(request.params.id);
    if (!value || Date.now() - value.createdAt > 900000)
      return reply.code(404).send({ error: 'Synthetic context not found or expired' });
    return {
      id: request.params.id,
      countryIso: value.countryIso,
      languageIso: value.languageIso,
      brand: value.brand,
    };
  });
  app.get('/demo/setup', async (_, reply) =>
    reply.type('text/html')
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic context setup</title></head><body><main><h1>Prepare a synthetic guest context</h1><form>
    <label>Country<select name="countryIso"><option value="es">Spain</option><option value="pt">Portugal</option></select></label>
    <label>Language<select name="languageIso"><option value="es">Spanish</option><option value="pt">Portuguese</option></select></label>
    <label>Brand<input name="brand" value="demo" required></label>
    <button type="submit">Create context</button><p role="alert" hidden></p></form></main>
    <script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();try{const response=await fetch('/api/demo/contexts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});if(!response.ok)throw new Error('Context preparation failed');const data=await response.json();location.href='/promotions?contextId='+encodeURIComponent(data.id)}catch(error){const alert=document.querySelector('[role=alert]');alert.textContent=error.message;alert.hidden=false}})</script></body></html>`),
  );
  app.get('/health', async () => ({ status: 'ready' }));
  app.get<{ Querystring: { countryIso: string; languageIso: string; brand: string } }>(
    '/api/promotions/free-shipping',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['countryIso', 'languageIso', 'brand'],
          additionalProperties: false,
          properties: {
            countryIso: { type: 'string', pattern: '^[a-z]{2}$' },
            languageIso: { type: 'string', pattern: '^[a-z]{2}$' },
            brand: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const match = promotions.find(
        (p) =>
          p.countryIso === request.query.countryIso &&
          p.languageIso === request.query.languageIso &&
          p.brand === request.query.brand,
      );
      return match || reply.code(404).send({ error: 'No promotion for this context' });
    },
  );
  app.get('/', async (_, reply) =>
    reply.redirect('/promotions?countryIso=es&languageIso=es&brand=demo'),
  );
  app.get('/promotions', async (_, reply) =>
    reply.type('text/html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shipping · QA Demo Store</title>
<style>body{margin:0;background:#f5f3ee;color:#213b38;font:16px system-ui}header{padding:26px 8%;border-bottom:1px solid #d7dfd9;display:flex;justify-content:space-between}a{color:#205b4a}main{max-width:750px;margin:75px auto;padding:24px}h1{font-size:48px;letter-spacing:-2px}section{padding:40px;border:1px solid #b9d1c4;border-radius:18px;background:#fff}h2{font-size:30px}strong{font-size:64px;color:#187253}.eyebrow{font-size:12px;letter-spacing:2px;text-transform:uppercase}footer{margin-top:30px;color:#688078}nav{display:flex;gap:20px}</style>
</head><body><header><b>fieldnotes / demo store</b><nav><a href="?countryIso=es&languageIso=es&brand=demo">España</a><a href="?countryIso=pt&languageIso=pt&brand=demo">Portugal</a></nav></header><main>
<p class="eyebrow">The little things, delivered.</p><h1>A little closer<br>to your doorstep.</h1><p id="loading" role="status">Loading promotion…</p>
<p id="error" role="alert" hidden></p><section aria-label="Free shipping promotion" hidden><p class="eyebrow">Your local offer</p><h2></h2><strong data-testid="promotion-amount"></strong><p id="subtitle"></p></section>
<footer>Synthetic demonstration data · No purchase or account required</footer></main>
<script>const params=new URLSearchParams(location.search);(params.has('contextId')?fetch('/api/demo/contexts/'+encodeURIComponent(params.get('contextId'))).then(async r=>{if(!r.ok)throw new Error('Synthetic context unavailable');const c=await r.json();return fetch('/api/promotions/free-shipping?'+new URLSearchParams({countryIso:c.countryIso,languageIso:c.languageIso,brand:c.brand}))}):fetch('/api/promotions/free-shipping?'+params)).then(async r=>{if(!r.ok)throw new Error(r.status===404?'No promotion available for this context.':'Please provide a valid country, language and brand.');return r.json()}).then(p=>{document.documentElement.lang=p.languageIso;document.querySelector('h2').textContent=p.title;document.querySelector('strong').textContent=${options.wrongAmount ? "'99€'" : 'p.discount'};document.querySelector('#subtitle').textContent=p.subtitle;document.querySelector('section').hidden=false}).catch(e=>{document.querySelector('#error').textContent=e.message;document.querySelector('#error').hidden=false}).finally(()=>{document.querySelector('#loading').hidden=true})</script></body></html>`),
  );
  return app;
}
