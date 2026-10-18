/**
 * Paystack Subscription Plan Helper for SOLO Driver Pro
 * Handles retrieval or automatic creation of the R499/month recurring plan.
 */

export const SOLO_DRIVER_PLAN_NAME = 'SOLO Driver Pro Monthly';
export const SOLO_DRIVER_MONTHLY_CENTS = 49900; // R499.00 in ZAR cents
export const SOLO_DRIVER_CURRENCY = 'ZAR';

let cachedPlanCode: string | null = null;

export async function getOrCreateDriverPlan(secretKey: string): Promise<string | null> {
  // 1. If explicit env var is set, prioritize it
  if (process.env.PAYSTACK_DRIVER_PLAN_CODE) {
    return process.env.PAYSTACK_DRIVER_PLAN_CODE;
  }

  if (cachedPlanCode) {
    return cachedPlanCode;
  }

  try {
    // 2. Query Paystack plans to see if SOLO plan already exists
    const listRes = await fetch('https://api.paystack.co/plan', {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    const listData = await listRes.json();

    if (listData.status && Array.isArray(listData.data)) {
      const existingPlan = listData.data.find(
        (p: { name?: string; interval?: string; amount?: number }) =>
          p.name?.toLowerCase().includes('solo driver') && p.interval === 'monthly'
      );
      if (existingPlan?.plan_code) {
        cachedPlanCode = existingPlan.plan_code;
        return cachedPlanCode;
      }
    }

    // 3. Create a new recurring plan if not found
    const createRes = await fetch('https://api.paystack.co/plan', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: SOLO_DRIVER_PLAN_NAME,
        interval: 'monthly',
        amount: SOLO_DRIVER_MONTHLY_CENTS, // R499.00 in ZAR cents
        currency: SOLO_DRIVER_CURRENCY,
        description: 'SOLO Zero-Commission Driver Pro Monthly Subscription',
      }),
    });
    const createData = await createRes.json();

    if (createData.status && createData.data?.plan_code) {
      cachedPlanCode = createData.data.plan_code;
      return cachedPlanCode;
    }
  } catch (err) {
    console.warn('Could not auto-fetch/create Paystack plan:', err);
  }

  return null;
}
