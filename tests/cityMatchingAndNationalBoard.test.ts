import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveCityFromCoords,
  resolveCityFromAddress,
  resolveCityFromLocation,
  isTripInDriverCity,
  areCitiesMatching,
  SOUTH_AFRICAN_CITIES,
} from '../src/utils/cityMatching.ts';

describe('City Matching & Driver Pool Isolation Suite', () => {
  it('contains primary South African cities in the registry', () => {
    const cityNames = SOUTH_AFRICAN_CITIES.map(c => c.name);
    assert.ok(cityNames.includes('Kimberley'), 'Must register Kimberley');
    assert.ok(cityNames.includes('Cape Town'), 'Must register Cape Town');
    assert.ok(cityNames.includes('Johannesburg'), 'Must register Johannesburg');
    assert.ok(cityNames.includes('Pretoria'), 'Must register Pretoria');
    assert.ok(cityNames.includes('Durban'), 'Must register Durban');
    assert.ok(cityNames.includes('Bloemfontein'), 'Must register Bloemfontein');
  });

  it('correctly resolves city from GPS coordinates', () => {
    // Kimberley (Big Hole / CBD)
    const kimberley = resolveCityFromCoords(-28.7419, 24.7719);
    assert.strictEqual(kimberley, 'Kimberley');

    // Cape Town (V&A Waterfront)
    const capeTown = resolveCityFromCoords(-33.9056, 18.4211);
    assert.strictEqual(capeTown, 'Cape Town');

    // Johannesburg (Sandton)
    const johannesburg = resolveCityFromCoords(-26.1076, 28.0567);
    assert.strictEqual(johannesburg, 'Johannesburg');

    // Durban (Umhlanga)
    const durban = resolveCityFromCoords(-29.7285, 31.0845);
    assert.strictEqual(durban, 'Durban');
  });

  it('correctly resolves city from address strings and landmarks', () => {
    assert.strictEqual(resolveCityFromAddress('North Cape Mall, Memorial Rd, Royldene, Kimberley'), 'Kimberley');
    assert.strictEqual(resolveCityFromAddress('Diamond Pavilion Mall, Oliver Rd, Monument Heights'), 'Kimberley');
    assert.strictEqual(resolveCityFromAddress('Klipkershout St, Royglen'), 'Kimberley');

    assert.strictEqual(resolveCityFromAddress('V&A Waterfront, 19 Dock Rd, Cape Town'), 'Cape Town');
    assert.strictEqual(resolveCityFromAddress('Camps Bay Beach, Victoria Rd, Camps Bay'), 'Cape Town');

    assert.strictEqual(resolveCityFromAddress('Sandton City Mall, Sandhurst, Sandton'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('Rosebank Mall, 50 Bath Ave, Rosebank'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('Burgandy Hills Estate'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('Burgundy Hills Estate, Bergbron'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('123 Hendrik Potgieter Rd, Roodepoort, Gauteng'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('Unit 14, Bergbron, GP'), 'Johannesburg');
    assert.strictEqual(resolveCityFromAddress('Random Suburb, Western Cape'), 'Cape Town');
    assert.strictEqual(resolveCityFromAddress('Midlands Estate, Pretoria'), 'Pretoria');

    assert.strictEqual(resolveCityFromAddress('Menlyn Park Shopping Centre, Atterbury Rd, Pretoria'), 'Pretoria');
    assert.strictEqual(resolveCityFromAddress('Gateway Theatre of Shopping, 1 Palm Blvd, Umhlanga'), 'Durban');
  });

  it('correctly resolves Burgandy Hills Estate and Gauteng locations', () => {
    // Exact user test case: "burgandy hills estate"
    assert.strictEqual(
      resolveCityFromLocation(undefined, undefined, 'burgandy hills estate'),
      'Johannesburg',
      'burgandy hills estate must resolve to Johannesburg'
    );
    assert.strictEqual(
      resolveCityFromLocation(undefined, undefined, 'Burgandy Hills Estate'),
      'Johannesburg',
      'Burgandy Hills Estate (capitalized) must resolve to Johannesburg'
    );
    assert.strictEqual(
      resolveCityFromLocation(-26.155, 27.935, 'Burgundy Hills Estate'),
      'Johannesburg',
      'Burgundy Hills Estate with coordinates must resolve to Johannesburg'
    );
    // Unidentified address must return 'Other' and NEVER default to 'Kimberley'
    assert.strictEqual(
      resolveCityFromLocation(undefined, undefined, 'Unknown Location XYZ 99999'),
      'Other',
      'Unidentified location must return Other and NEVER default to Kimberley'
    );
    // Explicit address takes precedence over mismatched coordinates (e.g. phone in Kimberley during test)
    assert.strictEqual(
      resolveCityFromLocation(-28.7282, 24.7623, 'Burgandy hills estate — Burgandy Hills Estate, South Africa'),
      'Johannesburg',
      'Burgandy hills estate address must override mismatched Kimberley coordinates'
    );
  });

  it('validates areCitiesMatching handles metro-provincial synonyms', () => {
    assert.strictEqual(areCitiesMatching('Johannesburg', 'Gauteng'), true);
    assert.strictEqual(areCitiesMatching('gauteng', 'johannesburg'), true);
    assert.strictEqual(areCitiesMatching('Pretoria', 'Gauteng'), true);
    assert.strictEqual(areCitiesMatching('Cape Town', 'Western Cape'), true);
    assert.strictEqual(areCitiesMatching('Kimberley', 'Northern Cape'), true);
    assert.strictEqual(areCitiesMatching('Kimberley', 'Gauteng'), false);
    assert.strictEqual(areCitiesMatching('Kimberley', 'Johannesburg'), false);
    assert.strictEqual(areCitiesMatching('Cape Town', 'Johannesburg'), false);
  });

  it('strictly isolates push requests: Kimberley driver receives Kimberley trips ONLY', () => {
    const kimberleyDriverCoords = { lat: -28.7385, lng: 24.7639 }; // Kimberley driver GPS
    const driverCity = 'Kimberley';

    const kimberleyTrip = {
      pickup_lat: -28.7419,
      pickup_lng: 24.7719,
      pickup_location: 'The Big Hole, Tucker St, Kimberley',
    };

    const capeTownTrip = {
      pickup_lat: -33.9249,
      pickup_lng: 18.4241,
      pickup_location: 'Cape Town Station, Adderley St, Cape Town',
    };

    const joburgTrip = {
      pickup_lat: -26.2041,
      pickup_lng: 28.0473,
      pickup_location: 'Park Station, Rissik St, Johannesburg',
    };

    // Kimberley driver gets Kimberley trip:
    assert.strictEqual(
      isTripInDriverCity(kimberleyTrip, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      true,
      'Kimberley driver MUST match Kimberley trip'
    );

    // Kimberley driver MUST NOT receive Cape Town or Johannesburg trip:
    assert.strictEqual(
      isTripInDriverCity(capeTownTrip, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT be pushed Cape Town trip'
    );
    assert.strictEqual(
      isTripInDriverCity(joburgTrip, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT be pushed Johannesburg trip'
    );

    // EXACT USER INCIDENT TEST: "burgandy hills estate" MUST NEVER enter Kimberley driver pool:
    const burgandyHillsTripNoCoords = {
      pickup_location: 'burgandy hills estate',
    };
    assert.strictEqual(
      isTripInDriverCity(burgandyHillsTripNoCoords, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT receive Burgandy Hills Estate trip (address only)'
    );

    const burgandyHillsTripWithCoords = {
      pickup_lat: -26.155,
      pickup_lng: 27.935,
      pickup_location: 'burgandy hills estate',
    };
    assert.strictEqual(
      isTripInDriverCity(burgandyHillsTripWithCoords, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT receive Burgandy Hills Estate trip (with GPS coords ~450km away)'
    );

    // EVEN WITH STALE KIMBERLEY COORDS in trip object, Kimberley driver MUST NOT receive Burgandy Hills Estate:
    const burgandyHillsTripWithStaleKimberleyCoords = {
      pickup_lat: -28.7282,
      pickup_lng: 24.7623,
      pickup_location: 'Burgandy hills estate — Burgandy Hills Estate, South Africa',
    };
    assert.strictEqual(
      isTripInDriverCity(burgandyHillsTripWithStaleKimberleyCoords, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT receive Burgandy Hills Estate trip even if coordinates were mistakenly logged in Kimberley'
    );

    // Conversely, Johannesburg and Gauteng drivers MUST receive the trip:
    const joburgDriverCoords = { lat: -26.2041, lng: 28.0473 };
    assert.strictEqual(
      isTripInDriverCity(burgandyHillsTripWithCoords, joburgDriverCoords.lat, joburgDriverCoords.lng, 'Johannesburg'),
      true,
      'Johannesburg driver MUST receive Burgandy Hills Estate trip'
    );
    assert.strictEqual(
      isTripInDriverCity(burgandyHillsTripWithCoords, joburgDriverCoords.lat, joburgDriverCoords.lng, 'Gauteng'),
      true,
      'Gauteng driver MUST receive Burgandy Hills Estate trip'
    );

    // An unknown location without GPS must NOT match Kimberley driver pool:
    const unknownTrip = {
      pickup_location: 'Completely Unregistered Place 404',
    };
    assert.strictEqual(
      isTripInDriverCity(unknownTrip, kimberleyDriverCoords.lat, kimberleyDriverCoords.lng, driverCity),
      false,
      'Kimberley driver MUST NOT receive unverified/other trips'
    );
  });

  it('strictly isolates push requests: Cape Town driver receives Cape Town trips ONLY', () => {
    const capeTownDriverCoords = { lat: -33.9249, lng: 18.4241 };
    const driverCity = 'Cape Town';

    const capeTownTrip = {
      pickup_lat: -33.9056,
      pickup_lng: 18.4211,
      pickup_location: 'V&A Waterfront, Cape Town',
    };

    const kimberleyTrip = {
      pickup_lat: -28.7419,
      pickup_lng: 24.7719,
      pickup_location: 'North Cape Mall, Kimberley',
    };

    assert.strictEqual(
      isTripInDriverCity(capeTownTrip, capeTownDriverCoords.lat, capeTownDriverCoords.lng, driverCity),
      true,
      'Cape Town driver MUST match Cape Town trip'
    );

    assert.strictEqual(
      isTripInDriverCity(kimberleyTrip, capeTownDriverCoords.lat, capeTownDriverCoords.lng, driverCity),
      false,
      'Cape Town driver MUST NOT match Kimberley trip'
    );
  });

  it('filters National Trip Board by city, status, and query correctly', () => {
    const allNationalTrips = [
      {
        id: 'trip-kby-1',
        pickup_lat: -28.7419,
        pickup_lng: 24.7719,
        pickup_location: 'North Cape Mall, Kimberley',
        dropoff_location: 'Kimberley Airport',
        fare_amount: 120,
        status: 'requested',
        rider_name: 'Thabo',
      },
      {
        id: 'trip-cpt-1',
        pickup_lat: -33.9249,
        pickup_lng: 18.4241,
        pickup_location: 'V&A Waterfront, Cape Town',
        dropoff_location: 'Camps Bay',
        fare_amount: 150,
        status: 'in_progress',
        rider_name: 'Sarah',
      },
      {
        id: 'trip-jhb-1',
        pickup_lat: -26.1076,
        pickup_lng: 28.0567,
        pickup_location: 'Sandton City, Sandton',
        dropoff_location: 'Rosebank Mall',
        fare_amount: 90,
        status: 'completed',
        rider_name: 'David',
      },
    ];

    // Filter by city = 'kimberley'
    const kimberleyTrips = allNationalTrips.filter(t => {
      const city = resolveCityFromLocation(t.pickup_lat, t.pickup_lng, t.pickup_location);
      return city.toLowerCase() === 'kimberley';
    });
    assert.strictEqual(kimberleyTrips.length, 1);
    assert.strictEqual(kimberleyTrips[0].id, 'trip-kby-1');

    // Filter by status = 'requested'
    const requestedTrips = allNationalTrips.filter(t => t.status === 'requested');
    assert.strictEqual(requestedTrips.length, 1);
    assert.strictEqual(requestedTrips[0].id, 'trip-kby-1');

    // Search query = 'Sandton'
    const sandtonTrips = allNationalTrips.filter(t => {
      const q = 'sandton';
      return (
        t.pickup_location.toLowerCase().includes(q) ||
        t.dropoff_location.toLowerCase().includes(q)
      );
    });
    assert.strictEqual(sandtonTrips.length, 1);
    assert.strictEqual(sandtonTrips[0].id, 'trip-jhb-1');
  });
});
