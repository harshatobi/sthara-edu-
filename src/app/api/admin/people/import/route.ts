import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, requireAdmin } from '@/lib/admin/serverAuth';
import { crossRowProblems, managerLoop, nameKey, planImportRow, type ImportPlan, type ImportRow } from '@/lib/hr/engine';
import { hrError, loadPeople, moveHire, schoolToday } from '@/lib/hr/server';

export const dynamic = 'force-dynamic';

/**
 * Bulk load of the employee master from a sheet (hr.manage; personal, statutory or bank columns need hr.sensitive).
 *   POST { rows: [{ line, name, employeeCode?, ... }], commit?: boolean }
 * Without `commit` nothing is written: every row comes back with who it matches, what it would do and what is
 * wrong with it. With `commit` the file is saved only if no row has a problem. A row updates the person it matches
 * (employee code, then login email, then a name only one person has) and otherwise adds a new person with no login.
 * Blank cells leave existing values alone. Logins are never created here.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.rows) || !b.rows.length) return bad('There are no rows to import.');
  if (b.rows.length > 1000) return bad('That file has more than 1,000 people. Split it and import in parts.');
  const rows: ImportRow[] = b.rows.map((r: any, i: number) => {
    const out = { line: String(r?.line ?? i + 2) } as ImportRow;
    for (const [k, v] of Object.entries(r || {})) if (k !== 'line' && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 500);
    return out;
  });
  const school = admin.schoolId, today = schoolToday();

  try {
    const [people, depts, grades] = await Promise.all([
      loadPeople(db, school),
      db.from('hr_departments').select('id, name').eq('school_id', school),
      db.from('hr_grades').select('id, name').eq('school_id', school),
    ]);
    if (depts.error) return hrError(depts.error, 'Could not read the school\'s structure.');
    const plans = rows.map(r => planImportRow(r, { today, people, departments: (depts.data || []).map(d => d.name), grades: (grades.data || []).map(g => g.name) }));
    crossRowProblems(plans);

    // "Reports to" may point at someone already on the register or at another row of the same file.
    const codes = new Set([...people.map(p => p.employeeCode?.toLowerCase()), ...plans.map(p => p.core.employeeCode?.toLowerCase())].filter(Boolean) as string[]);
    const nameCount = new Map<string, number>();
    for (const n of [...people.map(p => p.name), ...plans.filter(p => !p.match).map(p => p.name)]) nameCount.set(nameKey(n), (nameCount.get(nameKey(n)) || 0) + 1);
    for (const p of plans) {
      const to = p.core.reportsTo;
      if (!to || codes.has(to.toLowerCase())) continue;
      const n = nameCount.get(nameKey(to)) || 0;
      if (n === 0) p.problems.push(`Reports to "${to}": nobody has that employee code or name.`);
      else if (n > 1) p.problems.push(`Reports to "${to}": ${n} people have that name. Use their employee code.`);
    }
    const sensitive = plans.some(p => p.profile || p.statutory);
    if (sensitive) { const no = deny(admin, 'hr.sensitive'); if (no) return no; }

    const byId = new Map(people.map(p => [p.id, p]));
    const preview = plans.map(p => ({
      line: p.line, name: p.name, creates: !p.match, matchedBy: p.match?.how ?? null, matchedName: p.match ? byId.get(p.match.id)?.name ?? null : null,
      sets: [...Object.keys(p.core).filter(k => k !== 'name'), ...(p.profile ? ['personal details'] : []), ...(p.statutory ? ['statutory and bank'] : [])],
      problems: p.problems, notes: p.notes,
    }));
    const bad_ = plans.filter(p => p.problems.length).length;
    if (!b.commit || bad_) {
      return NextResponse.json({ ok: !bad_, committed: false, rows: preview, summary: { total: plans.length, creates: plans.filter(p => !p.match).length, updates: plans.filter(p => p.match).length, problems: bad_ } }, { status: b.commit && bad_ ? 422 : 200 });
    }

    // Structure the file names but the school doesn't have yet.
    const deptId = new Map((depts.data || []).map(d => [nameKey(d.name), d.id as string])), gradeId = new Map((grades.data || []).map(g => [nameKey(g.name), g.id as string]));
    for (const p of plans) {
      if (p.core.department && !deptId.has(nameKey(p.core.department))) {
        const { data, error } = await db.from('hr_departments').insert({ school_id: school, name: p.core.department, kind: p.core.category === 'teaching' ? 'academic' : p.core.category === 'office' ? 'administrative' : 'support' }).select('id').single();
        if (error) return hrError(error, `Could not add the department ${p.core.department}.`);
        deptId.set(nameKey(p.core.department), data.id);
      }
      if (p.core.grade && !gradeId.has(nameKey(p.core.grade))) {
        const { data, error } = await db.from('hr_grades').insert({ school_id: school, name: p.core.grade }).select('id').single();
        if (error) return hrError(error, `Could not add the grade ${p.core.grade}.`);
        gradeId.set(nameKey(p.core.grade), data.id);
      }
    }

    let created = 0, updated = 0;
    const warnings: string[] = [];
    const idOf = new Map<ImportPlan, string>();
    for (const p of plans) {
      const c = p.core;
      const job: Record<string, unknown> = {};
      if (c.category) job.category = c.category;
      if (c.designation !== undefined) job.designation = c.designation;
      if (c.department) job.department_id = deptId.get(nameKey(c.department));
      if (c.grade) job.grade_id = gradeId.get(nameKey(c.grade));
      if (c.employment) { job.employment = c.employment; if (c.employment === 'permanent') { job.contract_from = null; job.contract_to = null; } }
      if (c.contractTo && c.employment !== 'permanent') job.contract_to = c.contractTo;
      const rest: Record<string, unknown> = {};
      if (c.phone) rest.phone_e164 = c.phone;
      if (c.employeeCode) rest.employee_code = c.employeeCode;
      if (c.joinedOn) rest.joined_on = c.joinedOn;

      let id: string;
      if (p.match) {
        id = p.match.id;
        const cur = byId.get(id)!;
        if (!cur.userId && c.name && c.name !== cur.name) rest.name = c.name;
        if (job.employment && job.employment !== 'permanent' && !job.contract_to && !cur.contractTo) { warnings.push(`Row ${p.line}: ${p.name} was left ${cur.employment} because no contract end date was given.`); delete job.employment; }
        if (Object.keys(job).length || Object.keys(rest).length) {
          const { error } = await db.from('staff_members').update({ ...job, ...rest, updated_at: new Date().toISOString() }).eq('id', id).eq('school_id', school);
          if (error) return hrError(error, `Row ${p.line} (${p.name}) could not be saved. Rows above it were saved; fix this row and import again.`);
        }
        if (c.joinedOn && c.joinedOn !== cur.joinedOn) await moveHire(db, id, c.joinedOn, today);
        updated++;
      } else {
        const { data, error } = await db.from('staff_members').insert({ school_id: school, name: c.name, category: c.category, designation: '', ...job, ...rest, created_by: admin.id }).select('id').single();
        if (error) return hrError(error, `Row ${p.line} (${p.name}) could not be saved. Rows above it were saved; fix this row and import again.`);
        id = data.id;
        created++;
      }
      idOf.set(p, id);

      for (const [table, incoming] of [['staff_profiles', p.profile], ['staff_statutory', p.statutory]] as const) {
        if (!incoming) continue;
        // Only the cells the file filled in; everything else on the record stays.
        const set = Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== null));
        const { error } = await db.from(table).upsert({ staff_member_id: id, school_id: school, ...set, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'staff_member_id' });
        if (error) return hrError(error, `Row ${p.line} (${p.name}): the ${table === 'staff_profiles' ? 'personal' : 'statutory and bank'} details could not be saved.`);
      }
    }

    // Reporting lines last, once everyone in the file exists.
    const after = await loadPeople(db, school);
    for (const p of plans) {
      const to = p.core.reportsTo;
      if (!to) continue;
      const id = idOf.get(p)!;
      const mgr = after.find(x => x.employeeCode?.toLowerCase() === to.toLowerCase()) ?? after.find(x => nameKey(x.name) === nameKey(to));
      if (!mgr || mgr.id === id || !mgr.active || managerLoop(after, id, mgr.id)) { warnings.push(`Row ${p.line}: ${p.name}'s reporting manager was not set (${!mgr ? 'not found' : mgr.id === id ? 'it is themselves' : !mgr.active ? `${mgr.name} has left` : 'it would make a loop'}).`); continue; }
      const { error } = await db.from('staff_members').update({ manager_id: mgr.id, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) warnings.push(`Row ${p.line}: ${p.name}'s reporting manager was not set.`);
      else { const me = after.find(x => x.id === id); if (me) me.managerId = mgr.id; }
    }
    return NextResponse.json({ ok: true, committed: true, created, updated, warnings });
  } catch (e: any) {
    return hrError(e, 'The import failed. Nothing further was saved.');
  }
}
