/**
 * What happens after Stripe says money moved. The webhook decides *what* happened; a Fulfiller decides
 * what to do about it. Today that is Bento: it stores the key on the subscriber and fires an event that
 * an automation turns into the license email. Swap the implementation to add a database or a mailer.
 */
import type { BentoClient } from './bento';

export type Fulfilment =
  | { type: 'license.issued'; email: string; plan: string; key: string; customer: string; subject: string }
  | { type: 'license.renewed'; email: string; plan: string; customer: string; subscription: string }
  | { type: 'license.ended'; email: string; plan: string; customer: string; subscription: string }
  | { type: 'payment.failed'; email: string; plan: string; customer: string; payUrl: string | null };

export type Fulfiller = (f: Fulfilment) => Promise<void>;

const EVENT: Record<Fulfilment['type'], string> = {
  'license.issued': '$netrelish_license_issued',
  'license.renewed': '$netrelish_license_renewed',
  'license.ended': '$netrelish_license_ended',
  'payment.failed': '$netrelish_payment_failed',
};

export function bentoFulfiller(bento: BentoClient): Fulfiller {
  return async (f) => {
    const { type, email, ...details } = f;
    if (type === 'license.issued') {
      await bento.post('batch/subscribers', {
        subscribers: [{ email, tags: 'netrelish-pro', license_key: f.key, license_plan: f.plan, stripe_customer: f.customer }],
      });
    }
    await bento.post('batch/events', { events: [{ type: EVENT[type], email, details }] });
  };
}
