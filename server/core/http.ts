// How a request becomes an answer. A route lists its steps: first the checks (e.g. requireUser), then the
// controller. Every step gets the request; the first one that returns an answer ends it.
//
//    router.get('/me', read(requireUser, showMe));
//    router.post('/loans/:id/accept', write(requireUser, loanRole('lender'), accept));

import type { NextFunction, Request, Response } from 'express';
import { transaction } from './database.ts';

export interface Answer {
  status: number;
  body?: unknown; // sent as JSON; nothing is sent without it
}

type MaybeAnswer = Answer | null;
export type Step = (req: Request) => MaybeAnswer | Promise<MaybeAnswer>;

export function reply(status: number, body?: unknown): Answer {
  return { status, body };
}

export function refuse(status: number, error: string): Answer {
  return { status, body: { error } };
}

async function runSteps(steps: Step[], req: Request): Promise<Answer> {
  for (const step of steps) {
    const answer = await step(req);
    if (answer) return answer;
  }
  throw new Error('The last step must return an answer');
}

function send(res: Response, { status, body }: Answer) {
  if (body === undefined) res.status(status).end();
  else res.status(status).json(body);
}

// For requests that change nothing.
export function read(...steps: Step[]) {
  return async (req: Request, res: Response) => send(res, await runSteps(steps, req));
}

// For requests that change something: all steps are one transaction, so nobody else can change anything
// between the checks and the change. The answer is sent after everything has been saved.
export function write(...steps: Step[]) {
  return async (req: Request, res: Response) => send(res, await transaction(() => runSteps(steps, req)));
}

// One check as Express middleware, for what must be checked before an upload is received.
export function check(step: Step) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const answer = await step(req);
    if (answer) send(res, answer);
    else next();
  };
}

// An id from the client. Anything that can't be an id becomes 0, which no row has.
export function toId(value: unknown): number {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : 0;
}

// Text from the client, trimmed. Anything that isn't text (missing, a number, ...) counts as empty.
// (PostgreSQL can't store the character with code 0.)
export function toText(value: unknown): string {
  return typeof value === 'string' ? value.replaceAll('\0', '').trim() : '';
}
