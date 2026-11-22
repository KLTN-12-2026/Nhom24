const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const names = (skills) => (skills ?? []).map((s) => clean(s?.name)).filter(Boolean);

/** Văn bản hồ sơ đưa vào embedding (CONTRACT 7.2): headline + summary + skills + title/description các experiences */
export function buildProfileText(profile) {
  const p = profile ?? {};
  const skills = names((p.skills ?? []).filter((s) => s?.type !== 'language'));
  const experiences = (p.experiences ?? []).flatMap((e) => [clean(e?.title), clean(e?.description)]);
  return [clean(p.headline), clean(p.about) || clean(p.summary), skills.join(', '), ...experiences]
    .filter(Boolean)
    .join('\n');
}

/** Văn bản tin đưa vào embedding: title + description + requirements + danh sách skill */
export function buildJobText(job) {
  const j = job ?? {};
  const skills = [...names(j.requiredSkills), ...names(j.niceToHaveSkills)];
  return [clean(j.title), clean(j.description), clean(j.requirements), skills.join(', ')]
    .filter(Boolean)
    .join('\n');
}
