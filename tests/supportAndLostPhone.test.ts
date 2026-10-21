import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateTicketCode,
  saveSupportTicket,
  getSupportTickets,
  getSupportTicketByCode,
  updateSupportTicketStatus,
  buildOfficialSupportWhatsAppUrl,
  type SupportTicket,
} from '../src/utils/supportStore.ts';

describe('SOLO Rider Support & Lost Property Recovery Suite', () => {
  it('generates compliant ticket codes for lost property and general inquiries', () => {
    const lostPhoneCode = generateTicketCode('lost_phone');
    const lostItemCode = generateTicketCode('lost_item');
    const fareDisputeCode = generateTicketCode('fare_dispute');
    const otherCode = generateTicketCode('other');

    assert.match(lostPhoneCode, /^SOLO-LOST-\d{5}$/, 'Lost phone ticket code format must match SOLO-LOST-XXXXX');
    assert.match(lostItemCode, /^SOLO-LOST-\d{5}$/, 'Lost item ticket code format must match SOLO-LOST-XXXXX');
    assert.match(fareDisputeCode, /^SOLO-SPT-\d{5}$/, 'Fare dispute ticket code format must match SOLO-SPT-XXXXX');
    assert.match(otherCode, /^SOLO-SPT-\d{5}$/, 'General ticket code format must match SOLO-SPT-XXXXX');
  });

  it('persists and retrieves support tickets in safe storage', () => {
    const ticketId = 'test-ticket-uuid-001';
    const code = 'SOLO-LOST-77889';
    const newTicket: SupportTicket = {
      id: ticketId,
      ticketCode: code,
      category: 'lost_phone',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      riderIdentifier: '+27821112233',
      riderName: 'Kagiso Rabada',
      alternativeContactName: 'Hotel Concierge',
      alternativeContactPhone: '+27839998877',
      tripId: 'trip-abc-123',
      driverId: 'driver-xyz-789',
      driverName: 'Sipho Ndlovu',
      pickupLocation: 'Kimberley Club, Currey St',
      dropoffLocation: 'Flamingo Casino, Kimberley',
      itemDetails: {
        itemType: 'phone',
        brandModel: 'Samsung Galaxy S23',
        color: 'Phantom Black',
        caseOrFeatures: 'Navy Blue Spigen Armor case',
        lockScreenInfo: 'Proteas cricket wallpaper',
      },
      subject: 'Lost Samsung Galaxy S23',
      description: 'Phone slipped between back seat cushions.',
    };

    const saved = saveSupportTicket(newTicket);
    assert.strictEqual(saved.id, ticketId);
    assert.strictEqual(saved.ticketCode, code);

    const fetched = getSupportTicketByCode(code);
    assert.ok(fetched, 'Must retrieve saved ticket by tracking code');
    assert.strictEqual(fetched?.riderIdentifier, '+27821112233');
    assert.strictEqual(fetched?.itemDetails?.brandModel, 'Samsung Galaxy S23');
  });

  it('updates ticket status and records driver resolution notes', () => {
    const ticketId = 'test-ticket-uuid-002';
    const code = 'SOLO-LOST-99001';
    const ticket: SupportTicket = {
      id: ticketId,
      ticketCode: code,
      category: 'lost_phone',
      status: 'driver_notified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      riderIdentifier: 'rider@example.com',
      alternativeContactPhone: '+27845551234',
      subject: 'Lost iPhone 14 Pro',
      description: 'Left on front passenger seat.',
    };

    saveSupportTicket(ticket);

    const updated = updateSupportTicketStatus(
      code,
      'driver_confirmed_found',
      'Driver confirmed item safely secured in vehicle boot.'
    );

    assert.ok(updated, 'Update status must return updated ticket');
    assert.strictEqual(updated?.status, 'driver_confirmed_found');
    assert.strictEqual(updated?.driverNotes, 'Driver confirmed item safely secured in vehicle boot.');

    const reFetched = getSupportTicketByCode(code);
    assert.strictEqual(reFetched?.status, 'driver_confirmed_found');
  });

  it('builds official WhatsApp support URL with pre-filled diagnostics', () => {
    const url = buildOfficialSupportWhatsAppUrl({
      ticketCode: 'SOLO-LOST-12345',
      category: 'lost_phone',
      riderName: 'Bongani Zungu',
      riderPhone: '+27821234567',
      driverName: 'David Miller',
      vehiclePlate: 'NC 492-104',
      summary: 'Left gold iPhone in back seat. Alternative phone: 083 456 7890',
    });

    assert.ok(url.startsWith('https://wa.me/'), 'URL must target official wa.me endpoint');
    assert.ok(url.includes('SOLO-LOST-12345'), 'URL must encode ticket code in text');
    assert.ok(url.includes('Bongani+Zungu') || url.includes('Bongani%20Zungu'), 'URL must encode rider name');
    assert.ok(url.includes('NC+492-104') || url.includes('NC%20492-104'), 'URL must encode vehicle plate');
  });

  it('validates public /lost-phone page source has no login requirements', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'lost-phone', 'page.tsx'),
      'utf8'
    );

    assert.strictEqual(
      source.includes('alternativeContactPhone'),
      true,
      'Lost phone page must collect alternative contact phone number'
    );
    assert.strictEqual(
      source.includes('phoneMakeModel'),
      true,
      'Lost phone page must collect phone make/model'
    );
    assert.strictEqual(
      source.includes('dispatchLostItemDriverAlert'),
      true,
      'Lost phone page must trigger driver alert dispatch'
    );
  });

  it('validates driver page handles lost_item_alert and renders priority response UI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const driverPageSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'driver', 'page.tsx'),
      'utf8'
    );

    assert.strictEqual(
      driverPageSource.includes('lost_item_alert'),
      true,
      'Driver page must listen for lost_item_alert events'
    );
    assert.strictEqual(
      driverPageSource.includes('activeLostItemAlert'),
      true,
      'Driver page must track activeLostItemAlert state'
    );
    assert.strictEqual(
      driverPageSource.includes('Call Passenger') || driverPageSource.includes('tel:'),
      true,
      'Driver page must provide 1-tap call action for lost property contact'
    );
  });
});
