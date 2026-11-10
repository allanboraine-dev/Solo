import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

// Initial operational sample tickets for console management
const initialSampleTickets: any[] = [
  {
    id: 'spt_fare_48201',
    ticketCode: 'SOLO-FARE-48201',
    category: 'fare_dispute',
    status: 'open',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    riderIdentifier: '+27 72 345 6789',
    riderName: 'Lerato Moloi',
    alternativeContactPhone: '+27 72 345 6789',
    tripId: 'trip_ct_98412',
    driverId: 'drv_david_khumalo',
    driverName: 'David Khumalo',
    driverPhone: '+27 82 456 7890',
    vehiclePlate: 'CA 812-904',
    vehicleModel: 'Toyota Rumion',
    pickupLocation: 'Long Street, Cape Town CBD',
    dropoffLocation: 'Camps Bay Tidal Pool',
    fareZar: 115.0,
    tripDate: 'Today',
    subject: 'Disputed waiting time charge & meter discrepancy',
    description: 'Driver insisted on an extra R30 cash surcharge because of traffic along Kloof Nek, but the agreed app quote was R85.',
  },
  {
    id: 'spt_lost_19842',
    ticketCode: 'SOLO-LOST-19842',
    category: 'lost_phone',
    status: 'driver_notified',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    riderIdentifier: 'thabo.mokoena@gmail.com',
    riderName: 'Thabo Mokoena',
    alternativeContactName: 'Nomsa (Sister)',
    alternativeContactPhone: '+27 83 912 3456',
    tripId: 'trip_jhb_77124',
    driverId: 'drv_sipho_ndlovu',
    driverName: 'Sipho Ndlovu',
    driverPhone: '+27 84 123 9876',
    vehiclePlate: 'ZN 492-108',
    vehicleModel: 'Suzuki Ertiga',
    pickupLocation: 'Sandton City, Johannesburg',
    dropoffLocation: 'Rosebank Mall',
    fareZar: 74.0,
    tripDate: 'Today',
    itemDetails: {
      itemType: 'phone',
      brandModel: 'Samsung Galaxy S23 (Navy Blue)',
      color: 'Navy Blue',
      caseOrFeatures: 'Black leather wallet folio case with Gautrain gold card in back slot',
      approximateSeatLocation: 'back_seat',
    },
    subject: 'Urgent Lost Phone: Samsung Galaxy S23 (Navy Blue)',
    description: 'Phone slipped out of passenger pocket onto the rear passenger floor/seat while disembarking at Rosebank Mall drop-off zone.',
    driverNotes: 'Driver checked back seat. Item found and safely kept in glovebox.',
  },
  {
    id: 'spt_safe_31084',
    ticketCode: 'SOLO-SAFE-31084',
    category: 'safety_concern',
    status: 'investigating',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    riderIdentifier: '+27 81 555 2401',
    riderName: 'Sarah Jenkins',
    alternativeContactPhone: '+27 81 555 2401',
    tripId: 'trip_ct_44109',
    driverId: 'drv_michael_bester',
    driverName: 'Michael Bester',
    driverPhone: '+27 79 333 4411',
    vehiclePlate: 'CA 551-782',
    vehicleModel: 'Hyundai Grand i10',
    pickupLocation: 'V&A Waterfront, Cape Town',
    dropoffLocation: 'Sea Point Promenade',
    fareZar: 62.0,
    tripDate: 'Yesterday',
    subject: 'Reckless driving & mobile phone distraction',
    description: 'Driver appeared to be on an active video call while driving in wet conditions along Beach Road.',
    resolutionNotes: 'Compliance team reviewing driver safety rating history and telematics data.',
  },
  {
    id: 'spt_fare_66019',
    ticketCode: 'SOLO-FARE-66019',
    category: 'fare_dispute',
    status: 'resolved',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    resolvedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    riderIdentifier: '+27 76 890 1234',
    riderName: 'Kagiso Dlamini',
    tripId: 'trip_pta_12093',
    driverId: 'drv_david_khumalo',
    driverName: 'David Khumalo',
    driverPhone: '+27 82 456 7890',
    vehiclePlate: 'CA 812-904',
    vehicleModel: 'Toyota Rumion',
    pickupLocation: 'Menlyn Park Shopping Centre',
    dropoffLocation: 'Hatfield Station, Pretoria',
    fareZar: 91.0,
    tripDate: '2 days ago',
    subject: 'Cash payment confirmed but app status unclear',
    description: 'I paid R100 cash in the car and driver gave R9 change. Wanted to confirm my ride receipt reflects settled status.',
    resolutionNotes: 'Driver confirmed cash settlement in full. Digital receipt updated to paid and emailed to passenger.',
  },
];

const inMemoryGeneralTickets: any[] = [...initialSampleTickets];

function generateGeneralTicketCode(category: string): string {
  const prefix =
    category === 'fare_dispute'
      ? 'FARE'
      : category === 'safety_concern'
      ? 'SAFE'
      : category === 'lost_phone' || category === 'lost_item'
      ? 'LOST'
      : 'SPT';
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `SOLO-${prefix}-${randomDigits}`;
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'support_tickets',
    limit: 25,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Too many tickets submitted. Please wait before trying again.');
  }

  try {
    const body = await req.json();
    const {
      id,
      ticketCode: suppliedCode,
      category = 'other',
      status = 'open',
      subject,
      description,
      riderIdentifier,
      riderName,
      alternativeContactName,
      alternativeContactPhone,
      tripId,
      driverId,
      driverName,
      driverPhone,
      vehiclePlate,
      vehicleModel,
      pickupLocation,
      dropoffLocation,
      tripDate,
      fareZar,
      itemDetails,
    } = body || {};

    if (!subject || !description || !riderIdentifier) {
      return NextResponse.json(
        { success: false, error: 'Subject, description, and rider identifier are required.' },
        { status: 400 }
      );
    }

    const ticketCode = suppliedCode || generateGeneralTicketCode(category);
    const nowIso = new Date().toISOString();

    const ticket = {
      id: id || crypto.randomUUID(),
      ticketCode,
      category,
      status: status || 'open',
      createdAt: body?.createdAt || nowIso,
      updatedAt: nowIso,
      riderIdentifier,
      riderName: riderName || 'Rider',
      alternativeContactName: alternativeContactName || null,
      alternativeContactPhone: alternativeContactPhone || null,
      tripId: tripId || null,
      driverId: driverId || null,
      driverName: driverName || null,
      driverPhone: driverPhone || null,
      vehiclePlate: vehiclePlate || null,
      vehicleModel: vehicleModel || null,
      pickupLocation: pickupLocation || null,
      dropoffLocation: dropoffLocation || null,
      tripDate: tripDate || 'Recent',
      fareZar: fareZar || null,
      itemDetails: itemDetails || null,
      subject,
      description,
    };

    // Remove existing if duplicate id/ticketCode
    const existingIdx = inMemoryGeneralTickets.findIndex(
      (t) => t.id === ticket.id || t.ticketCode === ticket.ticketCode
    );
    if (existingIdx >= 0) {
      inMemoryGeneralTickets[existingIdx] = ticket;
    } else {
      inMemoryGeneralTickets.unshift(ticket);
    }

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
  const code = searchParams.get('code');
  const category = searchParams.get('category');
  const status = searchParams.get('status');

  let results = [...inMemoryGeneralTickets];

  if (code) {
    const found = results.find((t) => t.ticketCode.toUpperCase() === code.trim().toUpperCase());
    if (found) {
      return NextResponse.json({ success: true, ticket: found });
    }
    return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
  }

  if (rider) {
    results = results.filter((t) => t.riderIdentifier?.toLowerCase() === rider.toLowerCase());
  }

  if (category && category !== 'all') {
    results = results.filter((t) => t.category === category);
  }

  if (status && status !== 'all') {
    results = results.filter((t) => t.status === status);
  }

  return NextResponse.json({
    success: true,
    tickets: results.slice(0, 100),
    totalCount: results.length,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, ticketCode, status, resolutionNotes, driverNotes } = body || {};

    if (!ticketId && !ticketCode) {
      return NextResponse.json(
        { success: false, error: 'ticketId or ticketCode is required' },
        { status: 400 }
      );
    }

    const ticket = inMemoryGeneralTickets.find(
      (t) => (ticketId && t.id === ticketId) || (ticketCode && t.ticketCode === ticketCode)
    );

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found in memory store.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    if (status) {
      ticket.status = status;
      if (status === 'resolved' || status === 'closed') {
        ticket.resolvedAt = nowIso;
      }
    }
    if (resolutionNotes !== undefined) {
      ticket.resolutionNotes = resolutionNotes;
    }
    if (driverNotes !== undefined) {
      ticket.driverNotes = driverNotes;
    }
    ticket.updatedAt = nowIso;

    return NextResponse.json({
      success: true,
      ticket,
      message: 'Ticket updated successfully.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating ticket.' },
      { status: 500 }
    );
  }
}
