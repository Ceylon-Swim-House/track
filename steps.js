// The production process, defined once. Both the production room and the
// client tracking page read it. Internal steps roll up into client stages.

const STAGES = [
  { k: "queue",    label: "In queue",   blurb: "Your order is confirmed and booked into our production schedule." },
  { k: "cutting",  label: "Cutting",    blurb: "Your fabric is being cut by hand, piece by piece." },
  { k: "sewing",   label: "Sewing",     blurb: "Strings and bases are being sewn, assembled and finished by our own team.",
    kitBlurb: "Strings and pieces are being sewn and finished by our own team." },
  { k: "labeling", label: "Labeling",   blurb: "Your label is being applied to every set.",
    kitBlurb: "Your label is being applied to every kit." },
  { k: "packing",  label: "Packing",    blurb: "Every set is checked, then packed for delivery.",
    kitBlurb: "Every kit is checked, counted and packed for delivery." },
  { k: "dispatched", label: "Dispatched", blurb: "Your order is on its way." },
];

const STEPS = [
  { k: "settings",    n: "0",  label: "Blocks and settings checked", who: "Babi",    machine: true,  w: 0, stage: "cutting" },
  { k: "cut",         n: "1",  label: "Cut strings and bases",     who: "Babi",    machine: false, w: 1.5, stage: "cutting" },
  { k: "sewStrings",  n: "2",  label: "Sew strings",               who: "Nimsara", machine: true,  w: 2.0, stage: "sewing" },
  { k: "flipStrings", n: "3",  label: "Flip strings",              who: "Nimsara", machine: false, w: 0, stage: "sewing" },
  { k: "sewBases",    n: "4",  label: "Sew bases",                 who: "Babi",    machine: true,  w: 2.5, stage: "sewing" },
  { k: "insert",      n: "5",  label: "Insert strings into bases", who: "Nimsara", machine: false, w: 1.5, stage: "sewing" },
  { k: "attach",      n: "6",  label: "Attach strings to bases",   who: "Babi",    machine: true,  w: 1.5, stage: "sewing" },
  { k: "trim",        n: "7",  label: "Trim and flip",             who: "Nimsara", machine: false, w: 2.0, stage: "sewing" },
  { k: "touchups",    n: "8",  label: "Touch-ups",                 who: "Babi",    machine: true,  w: 1.5, stage: "sewing" },
  { k: "beads",       n: "9",  label: "Beads",                     who: "Either",  machine: false, w: 1.5, stage: "sewing", optional: true },
  { k: "labels",      n: "10", label: "Heat-transfer labels",      who: "Nimsara", machine: false, w: 1.0, stage: "labeling" },
  { k: "qc",          n: "11", label: "Quality check",             who: "Both",    machine: false, w: 0.5, stage: "packing" },
  { k: "pack",        n: "12", label: "Pack",                      who: "Both",    machine: false, w: 0.5, stage: "packing" },
];

// DIY kits (CSH-DK-…) skip inserting and attaching; the customer does those.
// Confirmed 23 Oct 2026; see spec-sheets/CSH-DK-001-diy-kit.md.
const KIT_STEPS = [
  { k: "settings",    n: "0", label: "Blocks and settings checked", who: "Babi",    machine: true,  w: 0, stage: "cutting" },
  { k: "cut",         n: "1", label: "Cutting",                     who: "Babi",    machine: false, w: 1.5, stage: "cutting" },
  { k: "sewStrings",  n: "2", label: "Sew strings",                 who: "Nimsara", machine: true,  w: 2.0, stage: "sewing" },
  { k: "sewBases",    n: "3", label: "Sew bases",                   who: "Babi",    machine: true,  w: 2.5, stage: "sewing" },
  { k: "flipStrings", n: "4", label: "Flip strings",                who: "Nimsara", machine: false, w: 0, stage: "sewing" },
  { k: "trim",        n: "5", label: "Trim",                        who: "Nimsara", machine: false, w: 1.0, stage: "sewing" },
  { k: "flipBases",   n: "6", label: "Flip bases",                  who: "Either",  machine: false, w: 1.0, stage: "sewing" },
  { k: "touchups",    n: "7", label: "Touch-ups",                   who: "Babi",    machine: true,  w: 1.5, stage: "sewing" },
  { k: "labels",      n: "8", label: "Labeling",                    who: "Nimsara", machine: false, w: 1.0, stage: "labeling" },
  { k: "qc",          n: "9", label: "Quality check",               who: "Both",    machine: false, w: 0.5, stage: "packing" },
  { k: "pack",        n: "10", label: "Pack kits",                  who: "Both",    machine: false, w: 0.5, stage: "packing" },
];

// An order made up only of kits. The server sends `kit` to the client page,
// which never sees the order lines.
function isKit(order) {
  if (typeof order.kit === "boolean") return order.kit;
  return !!order.lines && order.lines.length > 0 && order.lines.every(l => /^CSH-DK-/i.test(l.design));
}

function stepsFor(order) {
  if (isKit(order)) return KIT_STEPS;
  return STEPS.filter(s => !s.optional || order.beads);
}

// ---------- timeline ----------
// w = days a step took for 270 sets (context/production-process.md, Sep 2026).
// Flipping strings runs alongside sewing bases, so it adds no time. Steps overlap
// in practice, so the whole order is scaled to the measured elapsed time:
// 11 working days per 270 sets without beads; beads add 1.5 days per 270.
const SET_DAYS_PER_270 = 11;
const sumW = list => list.filter(s => !s.optional).reduce((t, s) => t + s.w, 0);
const KIT_DAYS_PER_270 = SET_DAYS_PER_270 * sumW(KIT_STEPS) / sumW(STEPS);

// Working days of production still left on an order.
function workDaysLeft(order) {
  const qty = (order.lines || []).reduce((t, l) => t + (Number(l.sets) || 0), 0);
  const steps = stepsFor(order);
  const left = s => ({ done: 0, doing: 0.5 }[(order.steps || {})[s.k]] ?? 1);
  const base = steps.filter(s => !s.optional);
  const perSet = (isKit(order) ? KIT_DAYS_PER_270 : SET_DAYS_PER_270) / 270;
  let days = perSet * qty * base.reduce((t, s) => t + s.w * left(s), 0) / sumW(base);
  const beads = steps.find(s => s.k === "beads");
  if (beads) days += (beads.w / 270) * qty * left(beads);
  return days;
}

// The date of the nth working day from today (0 = today), Sundays off.
function workDayDate(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) n--;
  }
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Orders run one after another in queue order: each starts when the one ahead finishes.
function schedule(orders) {
  let cursor = 0;
  return orders.map(o => {
    const days = workDaysLeft(o);
    const start = cursor;
    cursor += days;
    return { order: o, days, start: workDayDate(Math.floor(start)), finish: workDayDate(Math.max(0, Math.ceil(cursor) - 1)) };
  });
}

function stageBlurb(stage, order) {
  return (isKit(order) && stage.kitBlurb) || stage.blurb;
}

// How far through its own steps a stage is, 0 to 1. Each step counts twice:
// half when it's started, full when it's done, so the bar creeps forward.
function stageProgress(order, k) {
  if (k === "queue") return 1;
  if (order.dispatched) return 1;
  if (k === "dispatched") return 0;
  const list = stepsFor(order).filter(s => s.stage === k);
  if (!list.length) return 0;
  const st = order.steps || {};
  return list.reduce((t, s) => t + ({ doing: 1, done: 2 }[st[s.k]] || 0), 0) / (2 * list.length);
}

// Index into STAGES of the furthest checkpoint the order has reached.
function stageIndex(order) {
  if (order.dispatched) return STAGES.length - 1;
  let idx = 0;
  stepsFor(order).forEach(s => {
    const st = (order.steps || {})[s.k];
    if (st === "doing" || st === "done") {
      idx = Math.max(idx, STAGES.findIndex(g => g.k === s.stage));
    }
  });
  return idx;
}
