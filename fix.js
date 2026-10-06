const fs = require('fs');

let p = 'src/app/api/create-subscription/route.ts';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(/catch \(error: any\)/g, 'catch (error: unknown)').replace(/error\.message/g, '(error as Error).message');
fs.writeFileSync(p, c);

p = 'src/app/api/paystack-webhook/route.ts';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/catch \(error: any\)/g, 'catch (error: unknown)').replace(/error\.message/g, '(error as Error).message');
fs.writeFileSync(p, c);

p = 'src/app/driver/login/page.tsx';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/Don't/g, 'Don&apos;t');
fs.writeFileSync(p, c);

p = 'src/app/driver/page.tsx';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/driver's/gi, 'driver&apos;s').replace(/rider's/gi, 'rider&apos;s').replace(/Don't/g, 'Don&apos;t');
c = c.replace(/payload as any/g, 'payload as unknown').replace(/:\s*any/g, ': unknown');
fs.writeFileSync(p, c);

p = 'src/app/driver/register/page.tsx';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/Don't/g, 'Don&apos;t');
fs.writeFileSync(p, c);

p = 'src/app/layout.tsx';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/import Link from \"next\/link\";\r?\n?/g, '');
fs.writeFileSync(p, c);

p = 'src/components/BookingForm.tsx';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/import \{ MapPin, /g, 'import { ');
fs.writeFileSync(p, c);

p = 'src/lib/mockBackend.ts';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/const \{ data, error \} = await supabase.from\('trips'\).upsert/g, 'const { error } = await supabase.from(\'trips\').upsert');
c = c.replace(/payload: any/g, 'payload: unknown');
c = c.replace(/callback: \(type: EventType, payload: any\)/g, 'callback: (type: EventType, payload: unknown)');
fs.writeFileSync(p, c);

p = 'src/utils/supabase/middleware.ts';
c = fs.readFileSync(p, 'utf8');
c = c.replace(/\{ name, value, options \}/g, '{ name, value, options: _options }');
fs.writeFileSync(p, c);

console.log('Fixed!');
