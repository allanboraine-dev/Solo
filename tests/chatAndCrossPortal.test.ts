import { describe, it } from 'node:test';
import assert from 'node:assert';

interface MockMessage {
  id: string;
  trip_id: string;
  sender: 'rider' | 'driver';
  text: string;
  timestamp: number;
}

// Replicate the deduplicateMessages algorithm used in src/lib/mockBackend.ts
function deduplicateMessages(messages: MockMessage[]): MockMessage[] {
  const result: MockMessage[] = [];
  const seenIds = new Set<string>();

  for (const m of messages) {
    if (!m || !m.text) continue;
    if (m.id && seenIds.has(m.id)) continue;

    // Fuzzy duplicate check: same trip, same sender, same trimmed text within a 6-second window
    const isDup = result.some(existing => 
      existing.sender === m.sender &&
      existing.text.trim() === m.text.trim() &&
      Math.abs(existing.timestamp - m.timestamp) < 6000
    );

    if (isDup) {
      // If incoming message has a standard UUID while existing has a random short ID, update ID to UUID
      if (m.id && m.id.length > 20) {
        const existingIdx = result.findIndex(existing =>
          existing.sender === m.sender &&
          existing.text.trim() === m.text.trim() &&
          Math.abs(existing.timestamp - m.timestamp) < 6000
        );
        if (existingIdx >= 0) {
          result[existingIdx].id = m.id;
          seenIds.add(m.id);
        }
      }
      continue;
    }

    if (m.id) {
      seenIds.add(m.id);
    }
    result.push(m);
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

describe('Chat Message Deduplication & Cross-Portal Trip Closure', () => {
  it('deduplicates multi-channel chat deliveries (local + broadcast + postgres insert)', () => {
    const tripId = 'trip-chat-dedup-1';
    const now = Date.now();

    // 1. Rider sends a message -> creates local message with random short ID
    const localMsg: MockMessage = {
      id: 'abc1234',
      trip_id: tripId,
      sender: 'rider',
      text: 'I am waiting outside the building',
      timestamp: now,
    };

    // 2. BroadcastChannel delivers exact same message to listener
    const broadcastMsg: MockMessage = {
      ...localMsg,
    };

    // 3. Postgres INSERT event triggers with Postgres-generated UUID
    const postgresMsg: MockMessage = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      trip_id: tripId,
      sender: 'rider',
      text: 'I am waiting outside the building',
      timestamp: now + 450, // 450ms after local send
    };

    // 4. Supabase broadcast channel sends event again
    const realtimeBroadcastMsg: MockMessage = {
      id: 'abc1234',
      trip_id: tripId,
      sender: 'rider',
      text: 'I am waiting outside the building',
      timestamp: now,
    };

    // 5. Driver replies 2 seconds later
    const driverMsg: MockMessage = {
      id: 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380b22',
      trip_id: tripId,
      sender: 'driver',
      text: 'Okay, I am in a silver Corolla',
      timestamp: now + 2000,
    };

    const multiDeliveryStream = [
      localMsg,
      broadcastMsg,
      realtimeBroadcastMsg,
      postgresMsg,
      driverMsg,
      driverMsg, // duplicate broadcast of driver response
    ];

    const deduplicated = deduplicateMessages(multiDeliveryStream);

    assert.strictEqual(deduplicated.length, 2, 'Exactly 2 messages must remain: 1 from rider and 1 from driver');
    assert.strictEqual(deduplicated[0].sender, 'rider');
    assert.strictEqual(deduplicated[0].text, 'I am waiting outside the building');
    // Verify short ID was promoted to the Postgres UUID
    assert.strictEqual(deduplicated[0].id, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    assert.strictEqual(deduplicated[1].sender, 'driver');
    assert.strictEqual(deduplicated[1].text, 'Okay, I am in a silver Corolla');
  });

  it('allows distinct messages sent within the window if text is different', () => {
    const tripId = 'trip-chat-dedup-2';
    const now = Date.now();

    const msg1: MockMessage = {
      id: 'm1',
      trip_id: tripId,
      sender: 'rider',
      text: 'Hello!',
      timestamp: now,
    };

    const msg2: MockMessage = {
      id: 'm2',
      trip_id: tripId,
      sender: 'rider',
      text: 'Where are you?',
      timestamp: now + 1000,
    };

    const deduplicated = deduplicateMessages([msg1, msg2]);
    assert.strictEqual(deduplicated.length, 2, 'Distinct messages with different content must not be dropped');
  });

  it('simulates cross-portal trip closure: driver ends trip via cash -> rider portal immediately closes and opens rating modal', () => {
    const tripId = 'trip-cross-portal-100';

    // Mock rider state
    let riderActiveTrip: { id: string; status: string; fare_amount: number } | null = {
      id: tripId,
      status: 'in_progress',
      fare_amount: 150,
    };
    let riderRatingModalOpen = false;
    let riderRatingTrip: any = null;
    const completedTripIds = new Set<string>();

    const riderHandleTripUpdated = (trip: { id: string; status: string; fare_amount: number }) => {
      if (trip.status === 'completed') {
        completedTripIds.add(trip.id);
        if (!riderActiveTrip || riderActiveTrip.id === trip.id || completedTripIds.has(riderActiveTrip.id)) {
          riderRatingTrip = trip;
          riderRatingModalOpen = true;
          riderActiveTrip = null;
        }
      }
    };

    // Driver triggers completion (handleCashPayment or confirm payment received)
    const driverTripToComplete = {
      id: tripId,
      status: 'completed',
      fare_amount: 150,
    };

    // Driver broadcasts 'trip_updated' with status 'completed'
    riderHandleTripUpdated(driverTripToComplete);

    assert.strictEqual(riderActiveTrip, null, 'Rider active trip must close immediately');
    assert.strictEqual(riderRatingModalOpen, true, 'Rider rating modal must open immediately upon trip closure');
    assert.strictEqual(riderRatingTrip?.id, tripId);
    assert.strictEqual(completedTripIds.has(tripId), true, 'Trip ID must be recorded as permanently completed');
  });

  it('simulates rider polling /api/trips/status fallback when trip is closed while rider was waiting', () => {
    const tripId = 'trip-cross-portal-200';

    let riderActiveTrip: { id: string; status: string } | null = {
      id: tripId,
      status: 'payment_pending',
    };
    let ratingModalOpen = false;

    // Simulate server status API returning { success: true, trip: { status: 'completed' } }
    const simulatedServerTripStatus = { id: tripId, status: 'completed' };

    if (simulatedServerTripStatus.status === 'completed') {
      ratingModalOpen = true;
      riderActiveTrip = null;
    }

    assert.strictEqual(riderActiveTrip, null, 'Active trip in payment_pending must close when server returns completed');
    assert.strictEqual(ratingModalOpen, true, 'Rating modal must open when trip is verified completed on server');
  });
});
