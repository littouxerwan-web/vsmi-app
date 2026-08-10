import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SCHOOL_YEAR = 2026;
const N = (v: unknown) => Number(v ?? 0) || 0;

function money(v: number) {
  const value = Number.isFinite(v) ? v : 0;
  const sign = value < 0 ? "-" : "";
  const [whole, decimals] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${decimals} €`;
}

function schoolMonths(year: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = (8 + i) % 12;
    const y = i < 4 ? year : year + 1;
    const month = String(monthIndex + 1).padStart(2, "0");
    const key = `${y}-${month}`;
    const label = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(new Date(`${key}-01T12:00:00`));
    return { key, label };
  });
}

function monthsInclusive(start: string, end: string) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

function monthLabel(key: string) {
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${key}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Encode une chaîne pour une chaîne littérale PDF utilisant WinAnsiEncoding.
 * Important : l'euro est le byte 0x80 en WinAnsi, que l'on écrit ici en octal
 * (\\200) pour éviter les ? observés avec Buffer(..., "latin1").
 */
function pdfString(input: string) {
  const normalized = input
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/…/g, "...");

  let out = "";
  for (const char of normalized) {
    if (char === "€") {
      out += "\\200";
      continue;
    }
    if (char === "\\") {
      out += "\\\\";
      continue;
    }
    if (char === "(") {
      out += "\\(";
      continue;
    }
    if (char === ")") {
      out += "\\)";
      continue;
    }
    const code = char.charCodeAt(0);
    // Helvetica + WinAnsi couvre correctement le latin courant jusqu'à 255.
    out += code >= 32 && code <= 255 ? char : " ";
  }
  return out;
}

type PdfPage = { commands: string[] };

type TableColumn = {
  label: string;
  x: number;
  width: number;
  align?: "left" | "right";
};

class SimplePdf {
  pages: PdfPage[] = [{ commands: [] }];
  pageWidth = 595;
  pageHeight = 842;
  margin = 38;
  y = 804;

  get page() {
    return this.pages[this.pages.length - 1];
  }

  newPage() {
    this.pages.push({ commands: [] });
    this.y = 804;
  }

  text(text: string, x: number, y: number, size = 10, bold = false) {
    this.page.commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfString(text)}) Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5) {
    this.page.commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  rect(x: number, y: number, w: number, h: number, width = 0.7) {
    this.page.commands.push(`${width} w ${x} ${y} ${w} ${h} re S`);
  }

  fillRect(x: number, y: number, w: number, h: number, gray = 0.96) {
    this.page.commands.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
  }

  ensure(height: number) {
    if (this.y - height < 48) this.newPage();
  }

  header(title: string, subtitle?: string) {
    this.text(title, this.margin, this.y, 17, true);
    this.y -= 22;
    if (subtitle) {
      this.text(subtitle, this.margin, this.y, 9, false);
      this.y -= 20;
    } else {
      this.y -= 8;
    }
    this.line(this.margin, this.y, this.pageWidth - this.margin, this.y, 0.8);
    this.y -= 18;
  }

  sectionTitle(title: string) {
    this.ensure(32);
    this.text(title, this.margin, this.y, 12, true);
    this.y -= 18;
  }

  metricCard(x: number, top: number, w: number, label: string, value: string, sub?: string) {
    const h = 64;
    this.fillRect(x, top - h, w, h, 0.965);
    this.rect(x, top - h, w, h, 0.5);
    this.text(label, x + 10, top - 17, 8);
    this.text(value, x + 10, top - 39, 14, true);
    if (sub) this.text(sub, x + 10, top - 54, 7.5);
  }

  metricGrid(items: { label: string; value: string; sub?: string }[]) {
    const gap = 9;
    const width = (this.pageWidth - this.margin * 2 - gap) / 2;
    for (let i = 0; i < items.length; i += 2) {
      this.ensure(74);
      const top = this.y;
      items.slice(i, i + 2).forEach((item, j) =>
        this.metricCard(this.margin + j * (width + gap), top, width, item.label, item.value, item.sub),
      );
      this.y -= 73;
    }
  }

  callout(title: string, value: string, sub?: string) {
    const h = sub ? 70 : 57;
    this.ensure(h + 10);
    const x = this.margin;
    const w = this.pageWidth - this.margin * 2;
    const top = this.y;
    this.fillRect(x, top - h, w, h, 0.92);
    this.rect(x, top - h, w, h, 0.8);
    this.text(title, x + 12, top - 18, 9, true);
    this.text(value, x + 12, top - 40, 14, true);
    if (sub) this.text(sub, x + 12, top - 56, 8);
    this.y -= h + 12;
  }

  tableHeader(columns: TableColumn[]) {
    const h = 24;
    const x = this.margin;
    const w = this.pageWidth - this.margin * 2;
    const top = this.y;
    this.fillRect(x, top - h, w, h, 0.92);
    this.rect(x, top - h, w, h, 0.5);
    columns.forEach((c) => this.text(c.label, c.x + 6, top - 16, 7.5, true));
    this.y -= h;
  }

  tableRow(columns: TableColumn[], values: string[], height = 27) {
    this.ensure(height + 1);
    const x = this.margin;
    const w = this.pageWidth - this.margin * 2;
    const top = this.y;
    this.rect(x, top - height, w, height, 0.25);
    values.forEach((value, idx) => {
      const c = columns[idx];
      const maxChars = Math.max(8, Math.floor(c.width / 5.2));
      const shown = value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
      this.text(shown, c.x + 6, top - 18, 7.8, false);
    });
    this.y -= height;
  }

  pageFooter() {
    this.pages.forEach((page, index) => {
      page.commands.push(
        `BT /F1 7 Tf ${this.margin} 22 Td (${pdfString(`VSMI - Enfants 2026-2027 - page ${index + 1}/${this.pages.length}`)}) Tj ET`,
      );
    });
  }

  build() {
    this.pageFooter();

    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const kids: string[] = [];
    let obj = 3;
    const font1 = obj++;
    const font2 = obj++;

    objects[font1] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[font2] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    for (const page of this.pages) {
      const pageObj = obj++;
      const contentObj = obj++;
      kids.push(`${pageObj} 0 R`);
      const stream = page.commands.join("\n");
      objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
      objects[pageObj] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] ` +
        `/Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentObj} 0 R >>`;
    }

    objects[2] = `<< /Type /Pages /Count ${this.pages.length} /Kids [${kids.join(" ")}] >>`;

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let i = 1; i < objects.length; i++) {
      offsets[i] = Buffer.byteLength(pdf, "latin1");
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    return Buffer.from(pdf, "latin1");
  }
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { sub?: string; app_metadata?: { role?: string; photo_access?: boolean } }
    | undefined;

  if (error || !claims?.sub) return new Response("Non autorisé", { status: 401 });
  if (claims.app_metadata?.photo_access !== true || claims.app_metadata?.role === "personal") {
    return new Response("Accès refusé", { status: 403 });
  }

  const months = schoolMonths(SCHOOL_YEAR);
  const [{ data: settings }, { data: expenses = [] }] = await Promise.all([
    supabase.from("children_settings").select("*").eq("owner_id", claims.sub).maybeSingle(),
    supabase
      .from("children_expenses")
      .select("label,amount,annual_amount,smooth_annual,start_month,end_month,notes,paid_by")
      .eq("owner_id", claims.sub)
      .eq("school_year_start", SCHOOL_YEAR)
      .order("start_month"),
  ]);

  const person1 = settings?.person_1_name ?? "Moi";
  const person2 = settings?.person_2_name ?? "Autre parent";
  const i1 = N(settings?.income_person_1);
  const i2 = N(settings?.income_person_2);
  const incomeTotal = i1 + i2;
  const s1 = incomeTotal ? i1 / incomeTotal : 0.5;
  const s2 = 1 - s1;

  const rows = (expenses as any[]).map((x) => {
    const startKey = String(x.start_month).slice(0, 7);
    const endKey = String(x.end_month).slice(0, 7);
    const activeMonths = monthsInclusive(startKey, endKey);
    const annual = N(x.annual_amount) || N(x.amount) * (x.smooth_annual ? 12 : activeMonths);
    const monthly = annual / (x.smooth_annual ? 12 : activeMonths);
    return { ...x, startKey, endKey, activeMonths, annual, monthly };
  });

  const monthly = months.map((m) => {
    const active = rows
      .filter((x) => x.smooth_annual || (x.startKey <= m.key && x.endKey >= m.key))
      .map((x) => ({ ...x, monthAmount: x.monthly }));

    const total = active.reduce((a, x) => a + x.monthAmount, 0);
    const paid1 = active
      .filter((x) => x.paid_by !== "person_2")
      .reduce((a, x) => a + x.monthAmount, 0);
    const paid2 = active
      .filter((x) => x.paid_by === "person_2")
      .reduce((a, x) => a + x.monthAmount, 0);
    const due1 = total * s1;
    const due2 = total * s2;
    const balance = paid1 - due1;

    return {
      ...m,
      active,
      total,
      paid1,
      paid2,
      due1,
      due2,
      transfer: Math.abs(balance),
      from: balance < -0.005 ? person1 : balance > 0.005 ? person2 : null,
      to: balance < -0.005 ? person2 : balance > 0.005 ? person1 : null,
    };
  });

  const total = rows.reduce((a, x) => a + x.annual, 0);
  const paid1 = rows
    .filter((x) => x.paid_by !== "person_2")
    .reduce((a, x) => a + x.annual, 0);
  const paid2 = rows
    .filter((x) => x.paid_by === "person_2")
    .reduce((a, x) => a + x.annual, 0);
  const due1 = total * s1;
  const due2 = total * s2;
  const balance = paid1 - due1;
  const from = balance < -0.005 ? person1 : balance > 0.005 ? person2 : null;
  const to = balance < -0.005 ? person2 : balance > 0.005 ? person1 : null;

  const pdf = new SimplePdf();

  // PAGE(S) DE SYNTHÈSE
  pdf.header("ENFANTS - Synthèse 2026-2027", "Répartition des frais de septembre 2026 à août 2027");
  pdf.sectionTitle("Synthèse annuelle");
  pdf.metricGrid([
    { label: "Total des charges", value: money(total), sub: "Année scolaire complète" },
    {
      label: "Prorata des revenus",
      value: `${(s1 * 100).toFixed(2)} % / ${(s2 * 100).toFixed(2)} %`,
      sub: `${person1} / ${person2}`,
    },
    {
      label: `Payé directement par ${person1}`,
      value: money(paid1),
      sub: `Part théorique : ${money(due1)}`,
    },
    {
      label: `Payé directement par ${person2}`,
      value: money(paid2),
      sub: `Part théorique : ${money(due2)}`,
    },
  ]);

  if (from && to) {
    pdf.callout(
      "Régularisation annuelle",
      `${from} doit verser ${money(Math.abs(balance))} à ${to}`,
      "Après ce versement, chacun supporte exactement sa part théorique.",
    );
  } else {
    pdf.callout(
      "Régularisation annuelle",
      "Aucune régularisation",
      "Les paiements directs correspondent déjà aux parts théoriques.",
    );
  }

  pdf.sectionTitle("Dépenses paramétrées");
  const expenseColumns: TableColumn[] = [
    { label: "Dépense", x: pdf.margin, width: 145 },
    { label: "Période", x: pdf.margin + 145, width: 115 },
    { label: "Mensuel", x: pdf.margin + 260, width: 80 },
    { label: "Annuel", x: pdf.margin + 340, width: 80 },
    { label: "Payé par", x: pdf.margin + 420, width: 99 },
  ];
  pdf.tableHeader(expenseColumns);

  if (rows.length === 0) {
    pdf.tableRow(expenseColumns, ["Aucune dépense", "-", "-", "-", "-"]);
  } else {
    rows.forEach((row: any) => {
      if (pdf.y < 90) {
        pdf.newPage();
        pdf.header("Dépenses paramétrées - suite");
        pdf.tableHeader(expenseColumns);
      }
      const period = row.smooth_annual
        ? "Lissé sur 12 mois"
        : row.startKey === row.endKey
          ? monthLabel(row.startKey)
          : `${monthLabel(row.startKey)} - ${monthLabel(row.endKey)}`;
      pdf.tableRow(expenseColumns, [
        row.label,
        period,
        money(row.monthly),
        money(row.annual),
        row.paid_by === "person_2" ? person2 : person1,
      ]);
    });
  }

  // UNE PAGE CLAIRE PAR MOIS : aucune coupure de bloc.
  monthly.forEach((m) => {
    pdf.newPage();
    pdf.header(monthLabel(m.key), "Synthèse mensuelle des frais Enfants");

    pdf.metricGrid([
      { label: "Charges du mois", value: money(m.total), sub: "Total pris en compte" },
      {
        label: "Régularisation",
        value: m.from && m.to ? money(m.transfer) : "0,00 €",
        sub: m.from && m.to ? `${m.from} -> ${m.to}` : "Aucune",
      },
      {
        label: `Payé directement par ${person1}`,
        value: money(m.paid1),
        sub: `Part théorique : ${money(m.due1)}`,
      },
      {
        label: `Payé directement par ${person2}`,
        value: money(m.paid2),
        sub: `Part théorique : ${money(m.due2)}`,
      },
    ]);

    pdf.sectionTitle("Détail des dépenses du mois");
    const monthColumns: TableColumn[] = [
      { label: "Dépense", x: pdf.margin, width: 210 },
      { label: "Montant", x: pdf.margin + 210, width: 95 },
      { label: "Payé par", x: pdf.margin + 305, width: 115 },
      { label: "Mode", x: pdf.margin + 420, width: 99 },
    ];
    pdf.tableHeader(monthColumns);

    if (m.active.length === 0) {
      pdf.tableRow(monthColumns, ["Aucune charge ce mois", "-", "-", "-"]);
    } else {
      m.active.forEach((row: any) => {
        pdf.tableRow(monthColumns, [
          row.label,
          money(row.monthAmount),
          row.paid_by === "person_2" ? person2 : person1,
          row.smooth_annual ? "Lissé" : "Période",
        ]);
      });
    }
  });

  const bytes = pdf.build();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="enfants-2026-2027.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
