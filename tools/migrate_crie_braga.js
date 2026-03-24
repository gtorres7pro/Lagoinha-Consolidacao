#!/usr/bin/env node
/**
 * migrate_crie_braga.js
 * ─────────────────────────────────────────────────────────────────
 * Migrates real Braga data from CRIE Supabase → HUB Supabase
 *
 * Source : xtjpxemtsnulcrhwnmbg.supabase.co (CRIE Braga)
 * Target : uyseheucqikgcorrygzc.supabase.co (HUB Lagoinha)
 *
 * Run once: node tools/migrate_crie_braga.js
 * ─────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');

// ── Credentials ───────────────────────────────────────────────────
const CRIE_URL         = process.env.CRIE_SUPABASE_URL  || 'https://xtjpxemtsnulcrhwnmbg.supabase.co';
const CRIE_SERVICE_KEY = process.env.CRIE_SERVICE_KEY;

const HUB_URL          = process.env.HUB_SUPABASE_URL  || 'https://uyseheucqikgcorrygzc.supabase.co';
const HUB_SERVICE_KEY  = process.env.HUB_SERVICE_KEY;

if (!HUB_SERVICE_KEY) {
  console.error('❌  Missing HUB_SERVICE_KEY env variable.');
  console.error('   Run: HUB_SERVICE_KEY=<key> node tools/migrate_crie_braga.js');
  process.exit(1);
}

const crie = createClient(CRIE_URL, CRIE_SERVICE_KEY);
const hub  = createClient(HUB_URL,  HUB_SERVICE_KEY);

// ── Config: workspace name for Braga in HUB ───────────────────────
const BRAGA_WORKSPACE_NAME = 'Lagoinha Braga';

// ── Counters ─────────────────────────────────────────────────────
const counts = {
  workspace: 0, events: 0, members: 0,
  attendees: 0, finances: 0, payments: 0,
  skipped: 0, errors: 0
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CRIE Braga → HUB Migration');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Find or create Braga workspace in HUB
  console.log('1/6 – Looking up Braga workspace...');
  let { data: ws } = await hub
    .from('workspaces')
    .select('id, name')
    .ilike('name', `%braga%`)
    .single();

  if (!ws) {
    const { data: newWs, error: wsErr } = await hub
      .from('workspaces')
      .insert({
        name: BRAGA_WORKSPACE_NAME,
        status: 'active',
        credentials: {},
        knowledge_base: { address: 'Braga, Portugal', events: [], pastors: [] }
      })
      .select()
      .single();
    if (wsErr) { console.error('❌ Failed to create workspace:', wsErr.message); process.exit(1); }
    ws = newWs;
    counts.workspace = 1;
    console.log(`   ✅ Created workspace: ${ws.name} (${ws.id})`);
  } else {
    console.log(`   ✅ Found existing workspace: ${ws.name} (${ws.id})`);
  }
  const wsId = ws.id;

  // 2. Migrate events
  console.log('\n2/6 – Migrating events...');
  const { data: crieEvents } = await crie.from('Event').select('*');
  console.log(`   Found ${crieEvents?.length || 0} events in CRIE`);
  for (const ev of (crieEvents || [])) {
    const { error } = await hub.from('crie_events').upsert({
      id:               ev.id,
      workspace_id:     wsId,
      title:            ev.title,
      description:      ev.description,
      date:             ev.date,
      location:         ev.location,
      capacity:         ev.capacity || 0,
      price:            ev.price || 0,
      status:           ev.status || 'ARCHIVED',
      banner_url:       ev.bannerUrl,
      financial_locked: ev.financialLocked || false,
      report_sent_at:   ev.reportSentAt,
      created_at:       ev.createdAt,
    }, { onConflict: 'id' });
    if (error) {
      console.warn(`   ⚠️  Event "${ev.title}": ${error.message}`);
      counts.errors++;
    } else {
      counts.events++;
    }
  }
  console.log(`   ✅ ${counts.events} events migrated, ${counts.errors} errors`);

  // 3. Migrate members
  console.log('\n3/6 – Migrating members...');
  const { data: crieMembers } = await crie.from('Member').select('*');
  console.log(`   Found ${crieMembers?.length || 0} members in CRIE`);
  const errBefore = counts.errors;
  for (const m of (crieMembers || [])) {
    const { error } = await hub.from('crie_members').upsert({
      id:           m.id,
      workspace_id: wsId,
      name:         m.name,
      email:        m.email,
      phone:        m.phone,
      company:      m.company,
      industry:     m.industry,
      status:       m.status || 'Ativo',
      created_at:   m.createdAt,
    }, { onConflict: 'id' });
    if (error) {
      console.warn(`   ⚠️  Member "${m.name}": ${error.message}`);
      counts.errors++;
    } else {
      counts.members++;
    }
  }
  console.log(`   ✅ ${counts.members} members migrated, ${counts.errors - errBefore} errors`);

  // 4. Migrate member payments
  console.log('\n4/6 – Migrating member payments...');
  const { data: payments } = await crie.from('MemberPayment').select('*');
  console.log(`   Found ${payments?.length || 0} payments in CRIE`);
  const errBefore4 = counts.errors;
  for (const p of (payments || [])) {
    const { error } = await hub.from('crie_member_payments').upsert({
      id:          p.id,
      member_id:   p.memberId,
      amount:      p.amount,
      date:        p.date,
      description: p.description,
      created_at:  p.createdAt,
    }, { onConflict: 'id' });
    if (error) {
      counts.errors++;
    } else {
      counts.payments++;
    }
  }
  console.log(`   ✅ ${counts.payments} payments migrated, ${counts.errors - errBefore4} errors`);

  // 5. Migrate attendees
  console.log('\n5/6 – Migrating attendees...');
  const { data: attendees } = await crie.from('Attendee').select('*');
  console.log(`   Found ${attendees?.length || 0} attendees in CRIE (all events)`);
  const memberEmails = new Set((crieMembers || []).map(m => m.email.toLowerCase()));
  const errBefore5 = counts.errors;
  for (const a of (attendees || [])) {
    // Check if event was migrated
    const isMember = memberEmails.has(a.email.toLowerCase());
    const { error } = await hub.from('crie_attendees').upsert({
      id:               a.id,
      event_id:         a.eventId,
      workspace_id:     wsId,
      name:             a.name,
      email:            a.email,
      phone:            a.phone,
      company:          a.company,
      industry:         a.industry || 'Outros',
      interests:        a.interests || [],
      payment_status:   a.paymentStatus || 'Pendente',
      presence_status:  a.presenceStatus || 'Pendente',
      payment_proof_url: a.paymentProofUrl,
      is_member:        isMember,
      created_at:       a.createdAt,
    }, { onConflict: 'id' });
    if (error) {
      if (error.code === '23503') {
        // Foreign key: event not found (might be from another city)
        counts.skipped++;
      } else {
        console.warn(`   ⚠️  Attendee "${a.name}": ${error.message}`);
        counts.errors++;
      }
    } else {
      counts.attendees++;
    }
  }
  console.log(`   ✅ ${counts.attendees} attendees migrated, ${counts.skipped} skipped (diff city), ${counts.errors - errBefore5} errors`);

  // 6. Migrate finances
  console.log('\n6/6 – Migrating finances...');
  const { data: finances } = await crie.from('Finance').select('*');
  console.log(`   Found ${finances?.length || 0} finance records in CRIE`);
  const errBefore6 = counts.errors;
  for (const f of (finances || [])) {
    const { error } = await hub.from('crie_finances').upsert({
      id:           f.id,
      event_id:     f.eventId,
      workspace_id: wsId,
      type:         f.type,
      amount:       f.amount,
      description:  f.description,
      notes:        f.notes,
      receipt_url:  f.receiptUrl,
      created_at:   f.createdAt,
    }, { onConflict: 'id' });
    if (error) {
      if (error.code !== '23503') {
        counts.errors++;
      }
    } else {
      counts.finances++;
    }
  }
  console.log(`   ✅ ${counts.finances} finance records migrated, ${counts.errors - errBefore6} errors`);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Workspace : ${ws.name} (${ws.id})`);
  console.log(`  Events    : ${counts.events}`);
  console.log(`  Members   : ${counts.members}`);
  console.log(`  Payments  : ${counts.payments}`);
  console.log(`  Attendees : ${counts.attendees} (${counts.skipped} skipped)`);
  console.log(`  Finances  : ${counts.finances}`);
  console.log(`  Errors    : ${counts.errors}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
