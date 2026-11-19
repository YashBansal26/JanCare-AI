// Prescription safety check: allergies, drug-drug interactions, duplicate
// therapy, patient conditions and age. Rule-based on a small curated list of
// common OPD medicines (generic + popular Indian brand names).
// A decision aid for the doctor - not a complete drug database.

// generic -> { classes, aliases (brands / spellings) }
const DRUGS = {
  paracetamol: { classes: ['analgesic'], aliases: ['paracetamol', 'acetaminophen', 'crocin', 'dolo', 'calpol', 'pcm'] },
  ibuprofen: { classes: ['nsaid'], aliases: ['ibuprofen', 'brufen'] },
  diclofenac: { classes: ['nsaid'], aliases: ['diclofenac', 'voveran', 'voltaren'] },
  aceclofenac: { classes: ['nsaid'], aliases: ['aceclofenac', 'zerodol', 'hifenac'] },
  naproxen: { classes: ['nsaid'], aliases: ['naproxen', 'naprosyn'] },
  aspirin: { classes: ['nsaid', 'antiplatelet'], aliases: ['aspirin', 'ecosprin', 'disprin'] },
  amoxicillin: { classes: ['penicillin', 'antibiotic'], aliases: ['amoxicillin', 'amoxycillin', 'mox', 'novamox'] },
  amoxiclav: { classes: ['penicillin', 'antibiotic'], aliases: ['amoxiclav', 'augmentin', 'moxclav', 'clavam', 'co-amoxiclav'] },
  ampicillin: { classes: ['penicillin', 'antibiotic'], aliases: ['ampicillin'] },
  cefixime: { classes: ['cephalosporin', 'antibiotic'], aliases: ['cefixime', 'taxim-o', 'zifi'] },
  cephalexin: { classes: ['cephalosporin', 'antibiotic'], aliases: ['cephalexin', 'cefalexin', 'sporidex'] },
  ceftriaxone: { classes: ['cephalosporin', 'antibiotic'], aliases: ['ceftriaxone', 'monocef'] },
  azithromycin: { classes: ['macrolide', 'antibiotic', 'qt'], aliases: ['azithromycin', 'azithral', 'azee'] },
  clarithromycin: { classes: ['macrolide', 'antibiotic', 'qt', 'cyp3a4_inhibitor'], aliases: ['clarithromycin', 'claribid'] },
  ciprofloxacin: { classes: ['fluoroquinolone', 'antibiotic'], aliases: ['ciprofloxacin', 'ciplox', 'cifran'] },
  levofloxacin: { classes: ['fluoroquinolone', 'antibiotic', 'qt'], aliases: ['levofloxacin', 'levoflox', 'loxof'] },
  cotrimoxazole: { classes: ['sulfa', 'antibiotic'], aliases: ['cotrimoxazole', 'co-trimoxazole', 'septran', 'bactrim'] },
  metronidazole: { classes: ['antibiotic'], aliases: ['metronidazole', 'flagyl', 'metrogyl'] },
  doxycycline: { classes: ['tetracycline', 'antibiotic'], aliases: ['doxycycline', 'doxy'] },
  fluconazole: { classes: ['antifungal'], aliases: ['fluconazole', 'forcan'] },
  warfarin: { classes: ['anticoagulant'], aliases: ['warfarin', 'warf'] },
  clopidogrel: { classes: ['antiplatelet'], aliases: ['clopidogrel', 'clopilet', 'plavix'] },
  atorvastatin: { classes: ['statin'], aliases: ['atorvastatin', 'atorva', 'lipitor'] },
  rosuvastatin: { classes: ['statin'], aliases: ['rosuvastatin', 'rosuvas', 'crestor'] },
  simvastatin: { classes: ['statin'], aliases: ['simvastatin'] },
  metformin: { classes: ['antidiabetic'], aliases: ['metformin', 'glycomet', 'glucophage'] },
  glimepiride: { classes: ['antidiabetic', 'sulfonylurea'], aliases: ['glimepiride', 'amaryl'] },
  insulin: { classes: ['antidiabetic'], aliases: ['insulin', 'mixtard', 'lantus'] },
  amlodipine: { classes: ['antihypertensive'], aliases: ['amlodipine', 'amlong', 'stamlo'] },
  telmisartan: { classes: ['arb', 'antihypertensive', 'raas'], aliases: ['telmisartan', 'telma'] },
  losartan: { classes: ['arb', 'antihypertensive', 'raas'], aliases: ['losartan', 'losar'] },
  enalapril: { classes: ['ace_inhibitor', 'antihypertensive', 'raas'], aliases: ['enalapril', 'envas'] },
  ramipril: { classes: ['ace_inhibitor', 'antihypertensive', 'raas'], aliases: ['ramipril', 'cardace'] },
  spironolactone: { classes: ['potassium_sparing'], aliases: ['spironolactone', 'aldactone'] },
  potassium: { classes: ['potassium_supplement'], aliases: ['potassium chloride', 'kcl', 'potklor'] },
  furosemide: { classes: ['loop_diuretic'], aliases: ['furosemide', 'frusemide', 'lasix'] },
  digoxin: { classes: ['cardiac_glycoside'], aliases: ['digoxin', 'lanoxin'] },
  propranolol: { classes: ['beta_blocker'], aliases: ['propranolol', 'ciplar'] },
  isosorbide: { classes: ['nitrate'], aliases: ['isosorbide', 'sorbitrate', 'nitroglycerin', 'glyceryl trinitrate'] },
  sildenafil: { classes: ['pde5'], aliases: ['sildenafil', 'viagra', 'penegra'] },
  omeprazole: { classes: ['ppi', 'cyp2c19_inhibitor'], aliases: ['omeprazole', 'omez'] },
  pantoprazole: { classes: ['ppi'], aliases: ['pantoprazole', 'pan', 'pantocid'] },
  antacid: { classes: ['antacid', 'binder'], aliases: ['antacid', 'digene', 'gelusil', 'magnesium hydroxide', 'aluminium hydroxide'] },
  calcium: { classes: ['binder'], aliases: ['calcium', 'shelcal', 'calcimax'] },
  iron: { classes: ['binder'], aliases: ['iron', 'ferrous', 'livogen', 'orofer'] },
  levothyroxine: { classes: ['thyroid'], aliases: ['levothyroxine', 'thyronorm', 'eltroxin', 'thyroxine'] },
  cetirizine: { classes: ['antihistamine'], aliases: ['cetirizine', 'cetzine', 'okacet'] },
  levocetirizine: { classes: ['antihistamine'], aliases: ['levocetirizine', 'levocet', 'xyzal'] },
  montelukast: { classes: ['antiasthma'], aliases: ['montelukast', 'montair'] },
  salbutamol: { classes: ['antiasthma'], aliases: ['salbutamol', 'asthalin', 'albuterol'] },
  prednisolone: { classes: ['steroid'], aliases: ['prednisolone', 'wysolone', 'omnacortil'] },
  dexamethasone: { classes: ['steroid'], aliases: ['dexamethasone', 'decadron'] },
  tramadol: { classes: ['opioid', 'serotonergic'], aliases: ['tramadol', 'ultracet', 'contramal'] },
  sertraline: { classes: ['ssri', 'serotonergic'], aliases: ['sertraline', 'zoloft', 'serta'] },
  fluoxetine: { classes: ['ssri', 'serotonergic'], aliases: ['fluoxetine', 'prozac', 'flunil'] },
  escitalopram: { classes: ['ssri', 'serotonergic', 'qt'], aliases: ['escitalopram', 'nexito', 'stalopam'] },
  ondansetron: { classes: ['antiemetic', 'qt'], aliases: ['ondansetron', 'emeset', 'vomikind'] },
  domperidone: { classes: ['antiemetic', 'qt'], aliases: ['domperidone', 'domstal'] },
  methotrexate: { classes: ['dmard'], aliases: ['methotrexate', 'folitrax'] },
  lithium: { classes: ['mood_stabiliser'], aliases: ['lithium', 'licab'] },
  theophylline: { classes: ['methylxanthine'], aliases: ['theophylline', 'deriphyllin'] },
  allopurinol: { classes: ['antigout'], aliases: ['allopurinol', 'zyloric'] },
};
// Combination brands -> their generics
const COMBOS = { combiflam: ['ibuprofen', 'paracetamol'], ultracet: ['tramadol', 'paracetamol'], zerodolp: ['aceclofenac', 'paracetamol'], 'zerodol-p': ['aceclofenac', 'paracetamol'], 'hifenac-p': ['aceclofenac', 'paracetamol'] };

// Allergy words -> class or generic it covers
const ALLERGY_TERMS = {
  penicillin: { class: 'penicillin' }, amoxicillin: { class: 'penicillin' }, augmentin: { class: 'penicillin' },
  cephalosporin: { class: 'cephalosporin' }, sulfa: { class: 'sulfa' }, sulpha: { class: 'sulfa' }, sulfonamide: { class: 'sulfa' },
  nsaid: { class: 'nsaid' }, nsaids: { class: 'nsaid' }, painkiller: { class: 'nsaid' }, aspirin: { class: 'nsaid' },
  ibuprofen: { class: 'nsaid' }, brufen: { class: 'nsaid' }, diclofenac: { class: 'nsaid' },
  macrolide: { class: 'macrolide' }, azithromycin: { class: 'macrolide' }, erythromycin: { class: 'macrolide' },
  quinolone: { class: 'fluoroquinolone' }, fluoroquinolone: { class: 'fluoroquinolone' }, ciprofloxacin: { class: 'fluoroquinolone' },
  paracetamol: { drug: 'paracetamol' }, crocin: { drug: 'paracetamol' }, dolo: { drug: 'paracetamol' },
  metronidazole: { drug: 'metronidazole' }, tetracycline: { class: 'tetracycline' }, doxycycline: { class: 'tetracycline' },
};

// [a, b, severity, message] - a/b = generic name or 'class:<name>'
const INTERACTIONS = [
  ['warfarin', 'class:nsaid', 'major', 'Bleeding risk is much higher with an NSAID/aspirin on warfarin.'],
  ['warfarin', 'class:antiplatelet', 'major', 'Warfarin with an antiplatelet raises bleeding risk.'],
  ['warfarin', 'metronidazole', 'major', 'Metronidazole raises warfarin levels (INR) - bleeding risk.'],
  ['warfarin', 'cotrimoxazole', 'major', 'Co-trimoxazole raises warfarin levels (INR) - bleeding risk.'],
  ['warfarin', 'fluconazole', 'major', 'Fluconazole raises warfarin levels (INR) - bleeding risk.'],
  ['warfarin', 'class:fluoroquinolone', 'moderate', 'Fluoroquinolones can raise INR on warfarin - monitor.'],
  ['clopidogrel', 'omeprazole', 'moderate', 'Omeprazole reduces clopidogrel\'s effect - pantoprazole is preferred.'],
  ['aspirin', 'class:nsaid', 'moderate', 'Two NSAIDs (incl. aspirin) increase stomach bleeding risk.'],
  ['class:raas', 'class:potassium_sparing', 'major', 'ACE inhibitor/ARB with spironolactone can cause dangerously high potassium.'],
  ['class:raas', 'class:potassium_supplement', 'major', 'ACE inhibitor/ARB with potassium supplements can cause high potassium.'],
  ['class:raas', 'class:nsaid', 'moderate', 'NSAIDs reduce the BP effect of ACE inhibitors/ARBs and can harm the kidneys.'],
  ['class:statin', 'clarithromycin', 'major', 'Clarithromycin raises statin levels - risk of muscle damage (myopathy).'],
  ['class:ssri', 'tramadol', 'major', 'SSRI with tramadol - risk of serotonin syndrome and seizures.'],
  ['sildenafil', 'class:nitrate', 'contraindicated', 'Sildenafil with nitrates can cause a dangerous fall in blood pressure.'],
  ['class:fluoroquinolone', 'class:binder', 'moderate', 'Antacids/calcium/iron block quinolone absorption - give 2 hours apart.'],
  ['doxycycline', 'class:binder', 'moderate', 'Antacids/calcium/iron block doxycycline absorption - give 2-3 hours apart.'],
  ['levothyroxine', 'class:binder', 'moderate', 'Calcium/iron/antacids reduce levothyroxine absorption - give 4 hours apart.'],
  ['digoxin', 'furosemide', 'moderate', 'Furosemide can lower potassium and increase digoxin toxicity - monitor.'],
  ['methotrexate', 'cotrimoxazole', 'major', 'Co-trimoxazole with methotrexate can cause severe bone-marrow suppression.'],
  ['methotrexate', 'class:nsaid', 'moderate', 'NSAIDs can raise methotrexate levels.'],
  ['lithium', 'class:nsaid', 'major', 'NSAIDs raise lithium levels - toxicity risk.'],
  ['lithium', 'class:raas', 'major', 'ACE inhibitors/ARBs raise lithium levels - toxicity risk.'],
  ['theophylline', 'ciprofloxacin', 'major', 'Ciprofloxacin raises theophylline levels - toxicity risk.'],
  ['domperidone', 'clarithromycin', 'major', 'Both prolong the QT interval - risk of dangerous heart rhythm.'],
  ['class:sulfonylurea', 'cotrimoxazole', 'moderate', 'Co-trimoxazole can cause low blood sugar with glimepiride.'],
  ['class:sulfonylurea', 'class:fluoroquinolone', 'moderate', 'Quinolones can cause low or high blood sugar with sulfonylureas.'],
  ['allopurinol', 'amoxicillin', 'info', 'Allopurinol with amoxicillin increases the chance of a skin rash.'],
];

const CONDITION_RULES = [
  [/kidney|renal|ckd/i, ['class:nsaid', 'metformin'], 'moderate', 'Patient has kidney disease - avoid NSAIDs; check metformin dose.'],
  [/ulcer|gastritis|gi bleed/i, ['class:nsaid'], 'moderate', 'Patient has a stomach ulcer/gastritis history - NSAIDs can cause bleeding.'],
  [/asthma/i, ['class:beta_blocker', 'aspirin'], 'moderate', 'Patient has asthma - beta-blockers and aspirin can trigger attacks.'],
  [/pregnan/i, ['warfarin', 'class:statin', 'class:raas', 'doxycycline', 'methotrexate', 'class:fluoroquinolone'], 'major', 'Patient is pregnant - this medicine is not recommended in pregnancy.'],
  [/liver|hepat|cirrhosis/i, ['paracetamol', 'methotrexate', 'class:statin'], 'moderate', 'Patient has liver disease - use the lowest dose and monitor.'],
  [/bleeding|haemophilia|hemophilia/i, ['class:nsaid', 'class:antiplatelet', 'warfarin'], 'major', 'Patient has a bleeding disorder - avoid blood thinners/NSAIDs.'],
];

const AGE_RULES = [
  [age => age < 16, ['aspirin'], 'major', 'Aspirin is avoided in children under 16 (risk of Reye\'s syndrome).'],
  [age => age < 18, ['class:fluoroquinolone'], 'moderate', 'Fluoroquinolones are generally avoided in children.'],
  [age => age < 8, ['doxycycline'], 'moderate', 'Doxycycline is avoided under 8 years (tooth staining).'],
  [age => age < 12, ['tramadol'], 'major', 'Tramadol is not recommended under 12 years.'],
  [age => age >= 65, ['class:nsaid'], 'info', 'Older patient - NSAIDs carry higher kidney and stomach risk; use the shortest course.'],
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');

// medicine text -> list of generics (combination brands expand)
export function identify(name) {
  const t = norm(name);
  for (const [brand, generics] of Object.entries(COMBOS)) if (new RegExp(`\\b${brand}\\b`).test(t)) return generics;
  const hits = [];
  for (const [generic, d] of Object.entries(DRUGS)) {
    if (d.aliases.some(a => new RegExp(`(^|\\s)${a.replace(/[-]/g, '[- ]?')}(\\s|$|\\d)`).test(t))) hits.push(generic);
  }
  return hits;
}

const matches = (generic, spec) => (spec.startsWith('class:') ? DRUGS[generic]?.classes.includes(spec.slice(6)) : generic === spec);

/**
 * medicines: [{name}] being prescribed now; current: [{name, from}] other running courses
 * patient: { age, allergies: [string], conditions: [string] }
 */
export function checkPrescription(medicines, patient = {}, current = []) {
  const warnings = [];
  const items = [];
  const unknown = [];
  for (const m of medicines || []) {
    const g = identify(m.name);
    if (!m.name?.trim()) continue;
    if (!g.length) unknown.push(m.name);
    g.forEach(generic => items.push({ generic, name: m.name, current: false }));
  }
  for (const m of current || []) identify(m.name).forEach(generic => items.push({ generic, name: m.name, current: true, from: m.from }));
  const add = (w) => {
    if (w.type !== 'allergy' && w.type !== 'duplicate') w.message = `${w.drugs.join(' + ')}: ${w.message}`;
    if (!warnings.some(x => x.message === w.message)) warnings.push(w);
  };

  // 1. allergies
  for (const allergy of patient.allergies || []) {
    const words = norm(allergy).split(/\s+/);
    const term = words.map(w => ALLERGY_TERMS[w]).find(Boolean);
    for (const it of items.filter(i => !i.current)) {
      const direct = identify(allergy).includes(it.generic);
      const byTerm = term && (term.class ? DRUGS[it.generic].classes.includes(term.class) : term.drug === it.generic);
      if (direct || byTerm) add({ severity: 'contraindicated', type: 'allergy', drugs: [it.name], message: `Patient is allergic to ${allergy} - ${it.name} belongs to the same group.` });
      else if (term?.class === 'penicillin' && DRUGS[it.generic].classes.includes('cephalosporin')) {
        add({ severity: 'moderate', type: 'allergy', drugs: [it.name], message: `Penicillin allergy - small cross-reaction risk with ${it.name} (cephalosporin).` });
      }
    }
  }
  // 2. interactions (at least one side newly prescribed)
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.current && b.current) continue;
      if (a.generic === b.generic) {
        add({ severity: 'moderate', type: 'duplicate', drugs: [a.name, b.name], message: `Duplicate: ${a.name} and ${b.name} both contain ${a.generic}${b.current ? ' (already running from an earlier visit)' : ''}.` });
        continue;
      }
      for (const [x, y, severity, message] of INTERACTIONS) {
        if ((matches(a.generic, x) && matches(b.generic, y)) || (matches(a.generic, y) && matches(b.generic, x))) {
          add({ severity, type: 'interaction', drugs: [a.name, b.name], message: message + (a.current || b.current ? ' (one is from an earlier, still-running prescription)' : '') });
        }
      }
      const both = (c) => DRUGS[a.generic].classes.includes(c) && DRUGS[b.generic].classes.includes(c);
      if (both('nsaid') && a.generic !== 'aspirin' && b.generic !== 'aspirin') add({ severity: 'moderate', type: 'duplicate', drugs: [a.name, b.name], message: 'Two NSAID painkillers together - more side effects, no extra benefit.' });
      if (both('qt') && !(a.generic === 'domperidone' && b.generic === 'clarithromycin')) add({ severity: 'moderate', type: 'interaction', drugs: [a.name, b.name], message: 'Both can prolong the QT interval - avoid combining where possible.' });
    }
  }
  // 3. conditions and age
  const conditions = (patient.conditions || []).join(' ');
  for (const it of items.filter(i => !i.current)) {
    for (const [rx, specs, severity, message] of CONDITION_RULES) {
      if (rx.test(conditions) && specs.some(s => matches(it.generic, s))) add({ severity, type: 'condition', drugs: [it.name], message });
    }
    if (Number.isFinite(patient.age)) {
      for (const [test, specs, severity, message] of AGE_RULES) {
        if (test(patient.age) && specs.some(s => matches(it.generic, s))) add({ severity, type: 'age', drugs: [it.name], message });
      }
    }
  }
  const rank = { contraindicated: 0, major: 1, moderate: 2, info: 3 };
  warnings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { warnings, unknown, checked: items.filter(i => !i.current).length,
           notice: 'Rule-based check of common OPD medicines only - not a complete drug database.' };
}
