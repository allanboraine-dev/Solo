import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/utils/rateLimit';

const inMemoryGeneralTickets: any[] = [];

function generateGeneralTicketCode(category: string): string {
  const prefix = category === 'fare_dispute' ? 'FARE' : category === 'safety_concern' ? 'SAFE' : 'SPT';
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `SOLO-${prefix}-${randomDigits}`;
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'support_tickets',
    limit: 15,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const body = await req.json();
    const {
      category = 'other',
      subject,
      description,
      riderIdentifier,
      riderName,
      tripId,
      driverId,
      driverName,
      fareZar,
    } = body || {};

    if (!subject || !description || !riderIdentifier) {
      return NextResponse.json(
        { success: false, error: 'Subject, description, and rider identifier are required.' },
        { status: 400 }
      );
    }

    const ticketCode = generateGeneralTicketCode(category);
    const nowIso = new Date().toISOString();

    const ticket = {
      id: crypto.randomUUID(),
      ticketCode,
      category,
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
      riderIdentifier,
      riderName: riderName || 'Rider',
      tripId: tripId || null,
      driverId: driverId || null,
      driverName: driverName || null,
      fareZar: fareZar || null,
      subject,
      description,
    };

    inMemoryGeneralTickets.unshift(ticket);
    if (inMemoryGeneralTickets.length > 200) {
      inMemoryGeneralTickets.pop();
    }

    return NextResponse.json({
      success: true,
      ticketCode,
      ticket,
      message: 'Support ticket submitted successfully. A SOLO team member will review your inquiry.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error processing support ticket.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rider = searchParams.get('rider');

  if (rider) {
    const filtered = inMemoryGeneralTickets.filter((t) =>
      t.riderIdentifier?.toLowerCase() === rider.toLowerCase()
    );
    return NextResponse.json({ success: true, tickets: filtered });
  }

  return NextResponse.json({
    success: true,
    tickets: inMemoryGeneralTickets.slice(0, 50),
  });
}
