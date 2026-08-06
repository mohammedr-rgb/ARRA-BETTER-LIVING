import { num, parseMMDDDate, csvEscape, MONTH_NAMES } from './utils';

export const SWIGGY_MRP: Record<string, number> = {
  "GEM'S GOLD Cold Pressed Groundnut oil 500.0 ml": 180,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr": 300,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 2.0 ltr": 549,
  "GEM'S GOLD Cold Pressed Groundnut oil Pouch 1.0 ltr": 290,
  "GEM'S GOLD Dosa Spray 200.0 ml": 219,
};

export const BLINKIT_MRP: Record<string, number> = {
  "n.t.h Cold Pressed Extra Virgin Olive Oil Spray(Bottle) 200 ml": 299,
  "n.t.h Cold Pressed Groundnut Oil(Bottle) 1 ltr": 449,
  "N.t.h Extra Virgin Olive Oil(Bottle) 1 ltr": 1399,
  "GEM'S GOLD Cold Pressed Mustard oil Bottle 1.0 ltr": 349,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr": 449,
  "GEM'S GOLD Cold Pressed Sesame Oil 1.0 ltr": 275,
};

export function boxTypeFor(platform: string, city: string): string {
  if (platform === 'Swiggy') return city === 'CHENNAI' || city === 'COIMBATORE' ? 'Standard Box' : 'White Box';
  if (platform === 'Blinkit') return 'White Box';
  return '';
}

export function mrpFor(platform: string, product: string, fallback: number): number {
  if (platform === 'Swiggy') return SWIGGY_MRP[product] || fallback;
  if (platform === 'Blinkit') return BLINKIT_MRP[product] || fallback;
  return fallback;
}

export interface PlanRow {
  city: string;
  platform: string;
  product: string;
  mrp: number;
  boxType: string;
  salesQty: number;
  salesTonnage: number;
  salesBoxes: number;
  planQty: number;
  planTonnage: number;
  planBoxes: number;
}

export interface PlanData {
  period: string;
  planMonth: string;
  rows: PlanRow[];
  totals: { salesQty: number; planQty: number; planTonnage: number; planBoxes: number };
  boxTypeTotals: Record<string, { planQty: number; planBoxes: number; planTonnage: number }>;
}

export function buildProductionPlan(data: Record<string, string>[], projectionFactor: number = 0.95): PlanData {
  const now = new Date();
  const thisYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const prev3 = new Date(thisYear, currentMonth - 3, 1);
  const prev2 = new Date(thisYear, currentMonth - 2, 1);
  const prev1 = new Date(thisYear, currentMonth - 1, 1);

  const last3MonthOrders = data.filter(r => {
    const d = parseMMDDDate(r['DATE(MM-DD-YYYY)']);
    if (!d) return false;
    return (d.getMonth() === prev1.getMonth() && d.getFullYear() === prev1.getFullYear()) || (d.getMonth() === prev2.getMonth() && d.getFullYear() === prev2.getFullYear()) || (d.getMonth() === prev3.getMonth() && d.getFullYear() === prev3.getFullYear());
  });

  const combo: Record<string, { city: string; platform: string; product: string; qty: number; boxes: number; tonnage: number; mrp: number }> = {};
  last3MonthOrders.forEach(r => {
    const city = (r['City'] || 'Unknown').trim();
    const platform = r['Platform'] || 'Unknown';
    const product = r['Product'];
    if (!product) return;
    const key = `${city}||${platform}||${product}`;
    if (!combo[key]) combo[key] = { city, platform, product, qty: 0, boxes: 0, tonnage: 0, mrp: num(r['MRP']) };
    const cell = combo[key];
    cell.qty += num(r['PO Qty']);
    cell.boxes += num(r['Box Count']);
    cell.tonnage += num(r['Tonnage']);
  });

  const periodLabel = `${MONTH_NAMES[prev3.getMonth()]}–${MONTH_NAMES[prev1.getMonth()]}`;
  const planMonth = MONTH_NAMES[currentMonth];

  const rows: PlanRow[] = Object.values(combo).map(r => {
    const perUnitBoxes = r.qty ? r.boxes / r.qty : 0;
    const avgMonthlyQty = r.qty / 3;
    const planQty = Math.round(avgMonthlyQty * projectionFactor);
    return {
      city: r.city,
      platform: r.platform,
      product: r.product,
      mrp: mrpFor(r.platform, r.product, r.mrp),
      boxType: boxTypeFor(r.platform, r.city),
      salesQty: r.qty,
      salesTonnage: Math.round(r.tonnage),
      salesBoxes: r.boxes,
      planQty,
      planTonnage: Math.round(planQty * (r.qty ? r.tonnage / r.qty : 0)),
      planBoxes: Math.round(planQty * perUnitBoxes),
    };
  }).filter(x => x.salesQty > 0).sort((a, b) => b.planQty - a.planQty);

  const totals = rows.reduce((s, r) => ({
    salesQty: s.salesQty + r.salesQty,
    planQty: s.planQty + r.planQty,
    planTonnage: s.planTonnage + r.planTonnage,
    planBoxes: s.planBoxes + r.planBoxes,
  }), { salesQty: 0, planQty: 0, planTonnage: 0, planBoxes: 0 });

  const boxTypeTotals: Record<string, { planQty: number; planBoxes: number; planTonnage: number }> = {};
  rows.forEach(r => {
    const key = r.boxType || '(Unlabelled)';
    if (!boxTypeTotals[key]) boxTypeTotals[key] = { planQty: 0, planBoxes: 0, planTonnage: 0 };
    boxTypeTotals[key].planQty += r.planQty;
    boxTypeTotals[key].planBoxes += r.planBoxes;
    boxTypeTotals[key].planTonnage += r.planTonnage;
  });

  return { period: periodLabel, planMonth, rows, totals, boxTypeTotals };
}

export const BOX_TYPE_ORDER = ['White Box', 'Standard Box'] as const;

export function groupRowsByBoxType(rows: PlanRow[]): Array<{ boxType: string; rows: PlanRow[] }> {
  const sections: Array<{ boxType: string; rows: PlanRow[] }> = [];
  for (const bt of BOX_TYPE_ORDER) {
    const sectionRows = rows.filter(r => r.boxType === bt);
    if (sectionRows.length) sections.push({ boxType: bt, rows: sectionRows });
  }
  const otherRows = rows.filter(r => !BOX_TYPE_ORDER.includes(r.boxType as typeof BOX_TYPE_ORDER[number]));
  if (otherRows.length) sections.push({ boxType: '(Unlabelled)', rows: otherRows });
  return sections;
}

export function planCSVRows(planData: PlanData): string[] {
  const rows = ['Production Plan — ' + planData.planMonth];
  rows.push('');
  rows.push('Box Type,Product,MRP,Sales Qty (May-Jul),Plan Qty (Aug),Plan Boxes,Plan Tonnage (KG)');

  const lineFor = (r: PlanRow) => [
    r.boxType || '(Unlabelled)', r.product, r.mrp,
    r.salesQty, r.planQty, r.planBoxes, r.planTonnage,
  ].map(x => csvEscape(x)).join(',');

  groupRowsByBoxType(planData.rows).forEach(section => {
    rows.push('')
    rows.push(`--- ${section.boxType} ---`)
    section.rows.forEach(r => rows.push(lineFor(r)))
    const st = section.rows.reduce((s, r) => ({
      planQty: s.planQty + r.planQty,
      planBoxes: s.planBoxes + r.planBoxes,
      planTonnage: s.planTonnage + r.planTonnage,
    }), { planQty: 0, planBoxes: 0, planTonnage: 0 });
    rows.push(`SUBTOTAL ${section.boxType},,,,${st.planQty},${st.planBoxes},${st.planTonnage}`);
  });

  rows.push('');
  rows.push(`TOTAL,,,${planData.totals.salesQty},${planData.totals.planQty},${planData.totals.planBoxes},${planData.totals.planTonnage}`);

  rows.push('');
  rows.push('Box Type Summary');
  rows.push('Box Type,Plan Qty (Aug),Plan Boxes (Aug),Plan Tonnage (KG)');
  Object.entries(planData.boxTypeTotals).forEach(([bt, v]) => {
    rows.push(`${csvEscape(bt)},${v.planQty},${v.planBoxes},${v.planTonnage}`);
  });
  return rows;
}