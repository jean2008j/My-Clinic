// Run while the server is up:  npm run test:api
const BASE = process.env.API ?? 'http://localhost:4000';
let failed = 0;

const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++; };
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const patient = { patientName: 'Test Patient', phone: '0999 123 456', email: 'test@example.com', notes: 'smoke test', lang: 'en' };
const addMin = (iso, m) => new Date(Date.parse(iso) + m * 60000).toISOString();

try {
  const health = await call('GET', '/api/health');
  ok(health.status === 200, 'server is up');

  const { json: sv } = await call('GET', '/api/public/services');
  const { json: pv } = await call('GET', '/api/public/providers');
  ok(sv.services.length > 0 && pv.providers.length > 0, `services (${sv.services.length}) and providers (${pv.providers.length}) load`);

  const provider = pv.providers[0];                                  // Dr. Sara
  const long = sv.services.find((s) => s.duration_min === 90);        // root canal 90 min
  const short = sv.services.find((s) => s.duration_min === 30 && provider.serviceIds.includes(s.id)); // cleaning 30 min
  const P = provider.id;

  // find the first day with free slots (this month, then next)
  const now = new Date();
  const months = [0, 1].map((i) => { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  let date = null;
  for (const m of months) {
    const { json } = await call('GET', `/api/public/availability?providerId=${P}&serviceId=${long.id}&month=${m}`);
    const d = json.days.find((x) => x.slots > 0);
    if (d) { date = d.date; break; }
  }
  ok(!!date, `found a day with free slots: ${date}`);

  const slotsOf = async (sid, d = date) => (await call('GET', `/api/public/slots?providerId=${P}&serviceId=${sid}&date=${d}`)).json.slots;
  const slots = await slotsOf(long.id);
  const S = slots[0];
  ok(!!S, `first 90-min slot: ${S?.time}`);

  // 1) book
  const b1 = await call('POST', '/api/public/appointments', { providerId: P, serviceId: long.id, start: S.start, ...patient });
  ok(b1.status === 201 && b1.json.appointment.manageToken?.length === 32, 'booking created (201) with manage token');
  const token = b1.json.appointment.manageToken;

  // 2) the same slot again -> blocked
  const b2 = await call('POST', '/api/public/appointments', { providerId: P, serviceId: long.id, start: S.start, ...patient, phone: '0988111222' });
  ok(b2.status === 409 && b2.json.error === 'slot_unavailable', 'double booking of same slot is rejected (409)');

  // 3) overlap with a different duration -> blocked
  const overlapStart = addMin(S.start, 30);
  const b3 = await call('POST', '/api/public/appointments', { providerId: P, serviceId: short.id, start: overlapStart, ...patient, phone: '0988111222' });
  ok(b3.status === 409, 'overlapping booking (30 min inside the 90 min one) is rejected (409)');

  // 4) the 30-min slots list no longer contains anything inside the 90 minutes
  const shortSlots = await slotsOf(short.id);
  const inside = shortSlots.filter((x) => Date.parse(x.start) >= Date.parse(S.start) && Date.parse(x.start) < Date.parse(addMin(S.start, 90)));
  ok(inside.length === 0, 'no 30-min slots are offered inside the booked 90 minutes');

  // 5) view by token
  const g = await call('GET', `/api/public/appointments/${token}`);
  ok(g.status === 200 && g.json.appointment.patient.phone === '0999123456', 'view by token works (phone normalised)');
  const bad = await call('GET', '/api/public/appointments/' + 'a'.repeat(32));
  ok(bad.status === 404, 'wrong token -> 404');

  // 6) move to another slot
  const slotsAfter = await slotsOf(long.id);
  const S2 = slotsAfter.find((x) => Date.parse(x.start) >= Date.parse(addMin(S.start, 90)));
  if (S2) {
    const p = await call('PATCH', `/api/public/appointments/${token}`, { start: S2.start, notes: 'moved' });
    ok(p.status === 200 && p.json.appointment.startAt === S2.start, `rescheduled to ${S2.time}`);
    const free = (await slotsOf(long.id)).some((x) => x.start === S.start);
    ok(free, 'the old time is free again');
  } else console.log('⚠️  no second slot that day, skipped reschedule test');

  // 7) admin holiday blocks the day
  const login = await call('POST', '/api/auth/login', { email: 'admin@clinic.local', password: 'Admin12345' });
  const adminToken = login.json.token;
  const noAuth = await call('GET', '/api/admin/holidays');
  ok(noAuth.status === 401, 'admin API needs a token (401)');

  const h = await call('POST', '/api/admin/holidays', { day: date, providerId: P, reasonEn: 'smoke test', reasonAr: 'اختبار' }, adminToken);
  ok(h.status === 201 && h.json.affectedAppointments >= 1, `holiday created, affected appointments: ${h.json.affectedAppointments}`);
  ok((await slotsOf(long.id)).length === 0, 'no slots on a holiday');
  const dbl = await call('POST', '/api/admin/holidays', { day: date, providerId: P }, adminToken);
  ok(dbl.status === 409, 'same holiday twice is rejected (409)');
  const del = await call('DELETE', `/api/admin/holidays/${h.json.holiday.id}`, null, adminToken);
  ok(del.status === 200, 'holiday removed');

  // 8) cancel
  const c = await call('POST', `/api/public/appointments/${token}/cancel`);
  ok(c.status === 200 && c.json.appointment.status === 'cancelled', 'cancelled');
  const c2 = await call('POST', `/api/public/appointments/${token}/cancel`);
  ok(c2.status === 409, 'cancelling twice is rejected (409)');
  const list = await call('GET', `/api/admin/appointments?from=${date}&to=${date}`, null, adminToken);
  ok(list.status === 200 && list.json.appointments.length >= 1, 'admin can list appointments');

  // 9) batch 5: admin statistics, status changes, "own slot stays visible" when rescheduling
  const b4 = await call('POST', '/api/public/appointments', { providerId: P, serviceId: long.id, start: S.start, ...patient });
  ok(b4.status === 201, 'slot can be booked again after the cancellation');
  const t4 = b4.json.appointment.manageToken, id4 = b4.json.appointment.id;
  const own = await call('GET', `/api/public/slots?providerId=${P}&serviceId=${long.id}&date=${date}&token=${t4}`);
  ok(own.json.slots.some((x) => x.start === S.start), 'own current time is shown as free when the booking token is sent');
  const other = await call('GET', `/api/public/slots?providerId=${P}&serviceId=${long.id}&date=${date}`);
  ok(!other.json.slots.some((x) => x.start === S.start), '...but not for everyone else');

  const st = await call('GET', `/api/admin/stats?from=${date}&to=${date}`, null, adminToken);
  ok(st.status === 200 && st.json.totals.total >= 2 && st.json.byHour.length === 24 && st.json.byWeekday.length === 7, 'stats endpoint works');
  const stBad = await call('GET', `/api/admin/stats?from=${date}&to=2000-01-01`, null, adminToken);
  ok(stBad.status === 400, 'stats rejects a reversed date range (400)');

  const s1 = await call('PATCH', `/api/admin/appointments/${id4}`, { status: 'completed' }, adminToken);
  ok(s1.status === 200 && s1.json.appointment.status === 'completed', 'admin marks the visit completed');
  const s2 = await call('PATCH', `/api/admin/appointments/${id4}`, { status: 'confirmed' }, adminToken);
  ok(s2.status === 200, 'admin can move it back to confirmed');
  const s3 = await call('PATCH', `/api/admin/appointments/${id4}`, { status: 'cancelled' }, adminToken);
  ok(s3.status === 200, 'admin cancels it');
  const s4 = await call('PATCH', `/api/admin/appointments/${id4}`, { status: 'confirmed' }, adminToken);
  ok(s4.status === 409, 'a cancelled booking cannot be re-opened (409)');
  const s5 = await call('PATCH', `/api/admin/appointments/${id4}`, { status: 'completed' });
  ok(s5.status === 401, 'status change needs an admin login (401)');

  // 10) batch 6: doctor panel + reviews
  const b5 = await call('POST', '/api/public/appointments', { providerId: P, serviceId: long.id, start: S.start, ...patient });
  ok(b5.status === 201, 'booked again for the review test');
  const t5 = b5.json.appointment.manageToken, id5 = b5.json.appointment.id;
  const early = await call('POST', `/api/public/appointments/${t5}/review`, { rating: 5 });
  ok(early.status === 403 && early.json.error === 'cannot_review', 'cannot review before the visit is completed (403)');

  const dl = await call('POST', '/api/auth/login', { email: 'dr.sara@clinic.local', password: 'Doctor12345' });
  const docToken = dl.json.token;
  ok(dl.status === 200 && dl.json.user.role === 'provider', 'doctor can log in');
  const adminOnDoctorApi = await call('GET', '/api/provider/me', null, adminToken);
  ok(adminOnDoctorApi.status === 403, 'admin token is refused on the doctor API (403)');
  const mineList = await call('GET', `/api/provider/appointments?from=${date}&to=${date}`, null, docToken);
  ok(mineList.status === 200 && mineList.json.appointments.some((a) => a.id === id5), 'doctor sees own appointment of that day');
  ok(mineList.json.appointments.every((a) => a.provider_id === P), 'doctor sees ONLY own appointments');

  const otherDoc = pv.providers.find((x) => x.id !== P);
  const otherLogin = otherDoc ? await call('POST', '/api/auth/login', { email: 'dr.omar@clinic.local', password: 'Doctor12345' }) : null;
  if (otherLogin?.status === 200) {
    const foreign = await call('PATCH', `/api/provider/appointments/${id5}`, { status: 'completed' }, otherLogin.json.token);
    ok(foreign.status === 404, "another doctor cannot change this doctor's appointment (404)");
  }
  const noCancel = await call('PATCH', `/api/provider/appointments/${id5}`, { status: 'cancelled' }, docToken);
  ok(noCancel.status === 400, 'doctor cannot cancel through this endpoint (400)');
  const done5 = await call('PATCH', `/api/provider/appointments/${id5}`, { status: 'completed' }, docToken);
  ok(done5.status === 200, 'doctor marks the visit completed');

  const v = await call('GET', `/api/public/appointments/${t5}`);
  ok(v.json.appointment.canReview === true && v.json.appointment.review === null, 'completed visit can be reviewed');
  const badRate = await call('POST', `/api/public/appointments/${t5}/review`, { rating: 9 });
  ok(badRate.status === 400, 'rating outside 1-5 is rejected (400)');
  const rv = await call('POST', `/api/public/appointments/${t5}/review`, { rating: 5, comment: 'smoke test review' });
  ok(rv.status === 201 && rv.json.appointment.review?.rating === 5 && rv.json.appointment.canReview === false, 'review saved');
  const rv2 = await call('POST', `/api/public/appointments/${t5}/review`, { rating: 4 });
  ok(rv2.status === 409 && rv2.json.error === 'already_reviewed', 'a visit can be reviewed only once (409)');

  const pubBefore = await call('GET', '/api/public/reviews');
  ok(!pubBefore.json.reviews.some((r) => r.comment === 'smoke test review'), 'new review is NOT public before approval');
  const pend = await call('GET', '/api/admin/reviews?status=pending', null, adminToken);
  const mineRev = pend.json.reviews.find((r) => r.comment === 'smoke test review');
  ok(!!mineRev, 'admin sees the review waiting for approval');
  const appr = await call('PATCH', `/api/admin/reviews/${mineRev.id}`, { approved: true }, adminToken);
  ok(appr.status === 200, 'admin approves it');
  const pubAfter = await call('GET', '/api/public/reviews');
  const shown = pubAfter.json.reviews.find((r) => r.comment === 'smoke test review');
  ok(!!shown && shown.name === 'Test', 'approved review is public, first name only');
  const docRev = await call('GET', '/api/provider/reviews', null, docToken);
  ok(docRev.status === 200 && docRev.json.rating.count >= 1, 'doctor sees own reviews and rating');
  const delRev = await call('DELETE', `/api/admin/reviews/${mineRev.id}`, null, adminToken);
  ok(delRev.status === 200, 'admin can delete the test review');
  await call('PATCH', `/api/admin/appointments/${id5}`, { status: 'cancelled' }, adminToken); // clean up
} catch (e) {
  console.error('❌ test crashed:', e.message);
  failed++;
}

console.log(failed === 0 ? '\n🎉 All checks passed' : `\n${failed} check(s) failed`);
process.exit(failed ? 1 : 0);
