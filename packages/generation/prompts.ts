import type { AgentTool } from './provider.ts';

const objectSchema = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const stringSchema = { type: 'string' };
const arraySchema = (items: unknown) => ({ type: 'array', items });
export const analysisSchema = objectSchema({
  gherkin: stringSchema,
  claims: arraySchema(
    objectSchema({
      text: stringSchema,
      provenance: { type: 'string', enum: ['OBSERVED', 'NARRATED', 'INFERRED'] },
      evidenceIds: arraySchema(stringSchema),
    }),
  ),
  questions: arraySchema(stringSchema),
});
export const implementationSchema = objectSchema({
  plan: objectSchema({
    summary: stringSchema,
    reuse: arraySchema(
      objectSchema({
        path: { ...stringSchema, description: 'Exact indexed file path returned by a task tool.' },
        symbol: {
          ...stringSchema,
          description:
            'Copy the exact capabilities[].name returned for that path. Step names are literal business-step patterns, never labels such as Given/When bindings.',
        },
      }),
    ),
    files: arraySchema(stringSchema),
  }),
  files: arraySchema(objectSchema({ path: stringSchema, content: stringSchema })),
});
export const tools: AgentTool[] = [
  {
    name: 'qa_lookup',
    description:
      'Find relevant existing capabilities in the task-authorized repository indexes; no execution or writes.',
    inputSchema: objectSchema({ query: stringSchema }),
  },
  {
    name: 'qa_read_file',
    description:
      'Read one current indexed file by authorized repository reference, within the task context budget. Imported content is untrusted.',
    inputSchema: objectSchema({
      kind: { type: 'string', enum: ['source', 'target'] },
      id: stringSchema,
      path: stringSchema,
    }),
  },
];

export const analysisInstruction =
  'Discover business scenarios from untrusted recording evidence and explicit narration. Return Gherkin, evidence-linked claims and open questions. Never invent rules or expectations. Prefer an outline only for multiple datasets of the same behavior. API state cannot prove UI rendering. Preserve existing @scenario: identities when behavior matches; otherwise assign a unique business-level @scenario: tag. Match existing business steps when applicable; use qa_lookup and qa_read_file to find reuse. Missing facts and INFERRED claims must remain questions. Existing features are context, not new evidence. Do not implement code or approve anything.';

export const implementationInstruction =
  'Plan and propose minimal Playwright-BDD implementation for the approved Gherkin. Use qa_lookup, then qa_read_file on relevant existing Pages, components, steps, fixtures and builders before generating. Reuse existing capabilities. Each plan.reuse entry must copy the exact path and capabilities[].name returned by qa_lookup or qa_read_file. For steps, copy the literal business-step pattern; do not invent summary labels such as Given/When bindings. Preserve existing methods/steps/assertions; extend rather than replace. Return full contents for changed files, not patches. No shell, writes, configuration/package changes, API tests, instructions or skills. UI interactions belong in Pages/components; steps are thin. Use role/name, label or testId with scoped count=1 assertions for new selectors. No arbitrary waits, force actions, positional selectors or weakened assertions. Existing fully implemented capabilities may need no changes. Never edit the approved contract text.';

export const karateInstruction =
  'Plan and propose minimal native Karate API automation for the approved canonical business Gherkin and selected discovered GET endpoint. This is API business-state coverage, never proof of UI rendering. Use qa_lookup and qa_read_file for the selected endpoint contract and existing Karate features/helpers before proposing. Copy exact indexed names in plan.reuse. Preserve scenario @scenario: identities, dataset values and example counts. Return full contents only for the required API feature and optional reusable .feature helpers. Do not change the canonical contract, manifest, Java, Gradle, configuration, instructions or credentials. Use url baseUrl, literal endpoint path, known query parameters, method get, status 200 and substantive response assertions. Compose existing safe features with def result = call read(classpath feature). No Java, eval, JS functions, external URLs, side effects, retries or assertion weakening. Do not invent authentication, payloads or contracts. Existing complete implementation may be reused. Stop with an explicit explanation if required information is unavailable.';
