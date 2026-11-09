import { demoApp } from './app.ts';
const app = demoApp({ wrongAmount: process.env.QA_DEMO_WRONG_AMOUNT === '1' });
await app.listen({ host: '127.0.0.1', port: Number(process.env.DEMO_PORT || 4311) });
console.log('Demo ready on loopback');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
