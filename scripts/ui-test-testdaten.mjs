import { chromium } from "/mnt/devip3/schaltplan/node_modules/playwright-core/index.mjs";
import fs from "fs";
const exe = fs.readdirSync(process.env.HOME + "/.cache/ms-playwright").filter(d => d.startsWith("chromium-")).map(d => process.env.HOME + "/.cache/ms-playwright/" + d + "/chrome-linux/chrome").find(f => fs.existsSync(f));
const b = await chromium.launch({ executablePath: exe });
// Nur erfundene Testdaten – echte API komplett gesperrt
const lang = "Testfirma Mustermann Sondermaschinenbau und Anlagenautomatisierung GmbH & Co. KG";
const zeile = (i) => ({ id: "t" + i, name: i % 2 ? lang : "Test-Kunde " + i, companyName: i % 2 ? lang : "Test-Kunde " + i, title: i % 2 ? lang : "Testprojekt " + i, firstName: "Maximiliane", lastName: "Testperson-Langername-" + i,
  company: lang, city: "Teststadt-an-der-Langen-Beispielstraße", street: "Beispielweg 1", zip: "00000", email: "sehr.lange.testadresse.nummer" + i + "@beispiel-testdomain-nexus.example",
  phone: "+49 000 0000000", number: "K-T" + i, status: "aktiv", archived: false, kind: "Kunde", role: "Testrolle", contacts: [], links: [] });
const namen = ["Alpha Testbau", "Ähren Testhof", "Beta Probe GmbH", "Delta Muster AG", "Gamma Beispiel", "Kappa Demo KG", "Lambda Test", "Omega Fantasie", "Sigma Probe", "Zeta Muster", "1. Testverein", lang];
const daten = namen.map((n, i) => ({ ...zeile(i), name: n, companyName: n, title: n, lastName: n.split(" ")[0], firstName: "Test" }));
const seiten = (process.argv[2] || "/,/customers,/contacts,/employees,/suppliers,/projects").split(",");
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { localStorage.setItem("nexus_user", JSON.stringify({ name: "Test Nutzer", globalRole: "admin" })); });
await ctx.route("**/api/**", (r) => {
  const u = r.request().url();
  if (u.includes("/api/version")) return r.continue();
  if (u.includes("/api/health")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ counts: { customers: 123456, contacts: 98765, suppliers: 4321, projects: 77, tasks: 12, employees: 345, products: 99999, identities: 21 } }) });
  return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.match(/\/api\/[a-z]+\/[^/?]+$/) ? daten[1] : { data: daten, items: daten, count: daten.length, total: daten.length }) });
});
const p = await ctx.newPage(); const fehler = [];
p.on("pageerror", e => fehler.push(String(e.message).slice(0, 120)));
for (const s of seiten) {
  await p.goto("http://localhost:3050" + s, { waitUntil: "networkidle" }).catch(() => {}); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const raus = [];
    for (const el of document.querySelectorAll(".main *")) {
      const k = el.closest(".card, .ds-kachel, .ds-bereich, .kt-karte"); if (!k || k === el) continue;
      const a = el.getBoundingClientRect(), c = k.getBoundingClientRect();
      if (a.width && (a.right > c.right + 1 || a.left < c.left - 1)) raus.push((el.className && String(el.className).slice(0, 30)) || el.tagName);
    }
    const scroller = [...document.querySelectorAll("*")].filter(e => { const st = getComputedStyle(e); return /(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 300; }).map(e => e.className.toString().slice(0, 30) || e.tagName);
    return { ueber: document.documentElement.scrollWidth > innerWidth + 1, raus: [...new Set(raus)].slice(0, 6), scroller };
  });
  await p.screenshot({ path: (process.env.OUT || ".") + "/t-" + s.replace(/\//g, "_") + ".png" });
  console.log(s, r.ueber ? "ÜBERLAUF" : "ok", "| aus Karte:", r.raus.length, r.raus.join(","), "| Scrollbereiche:", r.scroller.join(","));
}
console.log("Seitenfehler:", fehler.length, fehler.slice(0, 3).join(" | "));
await b.close();
