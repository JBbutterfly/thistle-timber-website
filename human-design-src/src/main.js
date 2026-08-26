import "./styles.css";
import * as Storage from "./ui/storage.js";
import { computeChartFromUtcParts } from "./engine/hdEngine.js";
import { makeAstroTime } from "./engine/ephemeris.js";
import { computeNatalAstrology } from "./engine/astrology.js";
import { searchPlaces, localToUtc, formatOffset } from "./engine/geocode.js";
import { renderBodyGraphSvg, COLOR_PERSONALITY, COLOR_DESIGN, COLOR_BOTH } from "./ui/bodygraph.js";
import { GATE_NAMES } from "./engine/gateNames.js";
import { CENTER_DESCRIPTIONS, CENTERS, LINE_KEYNOTES, PROFILE_NARRATIVES } from "./engine/hdData.js";
import { CENTER_NARRATIVES } from "./engine/centerNarratives.js";
import { GATE_DESCRIPTIONS } from "./engine/gateDescriptions.js";
import { CHANNEL_DESCRIPTIONS } from "./engine/channelDescriptions.js";
import {
  computeGroupComposite,
  centerDefinitionTally,
  pairwiseConnections,
  buildCircleNarrative,
} from "./engine/circleEngine.js";

const app = document.getElementById("app");

// ─────────────────────────────────────────────────────────────────────────
// Chart computation cache — a person's chart is deterministic from their
// stored birth data, so compute once per render pass rather than per stored
// record (keeps storage itself small and always reflects the live engine).
// ─────────────────────────────────────────────────────────────────────────
function getChartFor(person) {
  const utcDate = new Date(person.birth.utcISO);
  const chart = computeChartFromUtcParts(utcDate);
  let astrology = null;
  if (typeof person.birth.latitude === "number") {
    const pTime = makeAstroTime(utcDate);
    astrology = computeNatalAstrology(pTime, person.birth.latitude, person.birth.longitude);
  }
  return { chart, astrology };
}

// ─────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  return parts;
}

function navigate(path) {
  location.hash = path;
}

function render() {
  const parts = parseRoute();
  window.scrollTo(0, 0);
  if (parts.length === 0) return renderHome();
  if (parts[0] === "person" && parts[1] === "new") return renderPersonForm(null);
  if (parts[0] === "person" && parts[2] === "edit") return renderPersonForm(Storage.getPerson(parts[1]));
  if (parts[0] === "person" && parts[1]) return renderPersonView(parts[1]);
  if (parts[0] === "circle" && parts[1] === "new") return renderCircleForm(null);
  if (parts[0] === "circle" && parts[2] === "edit") return renderCircleForm(Storage.getCircle(parts[1]));
  if (parts[0] === "circle" && parts[1]) return renderCircleView(parts[1]);
  return renderHome();
}

window.addEventListener("hashchange", render);

// ─────────────────────────────────────────────────────────────────────────
// Shared chrome
// ─────────────────────────────────────────────────────────────────────────
function layout(innerHtml, { eyebrow = "", title = "" } = {}) {
  app.innerHTML = `
    <header class="site-header">
      <div class="container">
        <a href="#/" class="brand">
          <span class="brand-word">Born Free Men<small>HUMAN DESIGN</small></span>
        </a>
        <nav class="app-nav">
          <a href="#/">My People</a>
          <a href="#/person/new">+ New Chart</a>
          <a href="#/circle/new">+ New Circle</a>
        </nav>
      </div>
    </header>
    <section class="tight">
      <div class="container">
        ${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ""}
        ${title ? `<h1>${title}</h1>` : ""}
      </div>
    </section>
    <section class="tight">
      <div class="container">${innerHtml}</div>
    </section>
    <footer class="app-footer">
      <div class="container">
        <span>Human Design charts are calculated in your browser from real astronomical ephemeris data. Nothing you enter is stored anywhere but this device.</span>
        <span>Born Free Men</span>
      </div>
    </footer>
  `;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────
function renderHome() {
  const people = Storage.getPeople();
  const circles = Storage.getCircles();

  const peopleHtml = people.length
    ? `<div class="grid grid-3">${people
        .map((p) => {
          const { chart } = getChartFor(p);
          return `<div class="card person-card" data-nav="#/person/${p.id}">
            <span class="name">${esc(p.name)}</span>
            <div>
              <span class="pill type">${esc(chart.type)}</span>
              <span class="pill profile">${esc(chart.profile)}</span>
            </div>
            <span class="disclaimer">${esc(chart.authority.name)}</span>
          </div>`;
        })
        .join("")}</div>`
    : `<div class="empty-state"><p>No charts yet. Add the first person to get started.</p><a href="#/person/new" class="btn primary">+ New Chart</a></div>`;

  const circlesHtml = circles.length
    ? `<div class="grid grid-3">${circles
        .map(
          (c) => `<div class="card person-card" data-nav="#/circle/${c.id}">
            <span class="name">${esc(c.name)}</span>
            <span class="disclaimer">${c.memberIds.length} member${c.memberIds.length === 1 ? "" : "s"}</span>
          </div>`
        )
        .join("")}</div>`
    : `<div class="empty-state"><p>No Brotherhood Circles yet. Once you've added a few charts, group them into a circle to see how they function together.</p><a href="#/circle/new" class="btn primary">+ New Circle</a></div>`;

  layout(
    `
    <div class="callout note stack-sm">
      <span class="eyebrow">What this is</span>
      <p style="margin-bottom:0">A Human Design + Astrology chart calculator, built from real ephemeris data (not a lookup table), plus a <strong>Brotherhood Circle</strong> tool for seeing how a group's charts work together — shared strengths, collective blind spots, and the connections between specific people. This is a tool for reflection and conversation, not a substitute for professional, medical, psychological, or spiritual counsel.</p>
    </div>
    <hr class="rule">
    <div class="chart-header">
      <div>
        <span class="eyebrow">Saved Charts</span>
        <h2 style="margin-bottom:16px">My People</h2>
      </div>
      <a href="#/person/new" class="btn primary">+ New Chart</a>
    </div>
    ${peopleHtml}
    <hr class="rule">
    <div class="chart-header">
      <div>
        <span class="eyebrow">Group Analysis</span>
        <h2 style="margin-bottom:16px">Brotherhood Circles</h2>
      </div>
      <a href="#/circle/new" class="btn primary">+ New Circle</a>
    </div>
    ${circlesHtml}
    `
  );
  bindNavClicks();
}

function bindNavClicks() {
  app.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav.replace(/^#\/?/, "")));
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Person form (new / edit)
// ─────────────────────────────────────────────────────────────────────────
function renderPersonForm(existing) {
  const isEdit = !!existing;
  let chosenLocation = existing
    ? {
        label: existing.birth.locationLabel,
        latitude: existing.birth.latitude,
        longitude: existing.birth.longitude,
        timezone: existing.birth.timezone,
      }
    : null;

  layout(
    `
    <span class="eyebrow">${isEdit ? "Edit" : "New"} Chart</span>
    <h1>${isEdit ? "Edit birth data" : "Enter birth data"}</h1>
    <p>The more precise the birth time, the more accurate the chart — especially for Authority and the Moon's placement, which can shift gates within hours. Location is only used to resolve the correct historical time zone; it's never sent anywhere except a free place-name lookup.</p>
    <form id="person-form" class="card" style="max-width:640px">
      <div class="field">
        <label for="f-name">Name</label>
        <input type="text" id="f-name" required value="${esc(existing?.name ?? "")}">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-date">Birth date</label>
          <input type="date" id="f-date" required value="${existing ? `${existing.birth.year}-${String(existing.birth.month).padStart(2, "0")}-${String(existing.birth.day).padStart(2, "0")}` : ""}">
        </div>
        <div class="field">
          <label for="f-time">Birth time</label>
          <input type="time" id="f-time" required value="${existing ? `${String(existing.birth.hour).padStart(2, "0")}:${String(existing.birth.minute).padStart(2, "0")}` : ""}" ${existing?.birth.unknownTime ? "disabled" : ""}>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div class="checkbox-row">
            <input type="checkbox" id="f-unknown-time" ${existing?.birth.unknownTime ? "checked" : ""}>
            <label for="f-unknown-time" style="margin:0">Birth time unknown (uses 12:00 noon)</label>
          </div>
        </div>
      </div>
      <div class="field">
        <label for="f-location">Birth location (city)</label>
        <input type="text" id="f-location" autocomplete="off" placeholder="Start typing a city..." value="${esc(chosenLocation?.label ?? "")}">
        <div class="location-results" id="location-results" style="display:none"></div>
        <div class="location-chosen" id="location-chosen">${chosenLocation ? `Selected: ${esc(chosenLocation.label)} (${chosenLocation.timezone})` : ""}</div>
      </div>
      <div class="callout warn" id="unknown-time-warning" style="${existing?.birth.unknownTime ? "" : "display:none"}; margin-bottom:16px">
        <span class="eyebrow">Reduced accuracy</span>
        <p style="margin-bottom:0">Without a birth time, Type, Profile, and most gates are usually still reliable — but the Moon (which can change gate every ~10-14 hours) and the Ascendant cannot be trusted, and Authority is occasionally affected. Treat this chart as a strong approximation, not a precise reading.</p>
      </div>
      <button type="submit" class="btn primary" id="submit-btn">${isEdit ? "Save changes" : "Calculate chart"}</button>
      <span id="form-error" style="color:var(--red);margin-left:12px"></span>
    </form>
    `
  );

  const form = document.getElementById("person-form");
  const locationInput = document.getElementById("f-location");
  const resultsBox = document.getElementById("location-results");
  const chosenBox = document.getElementById("location-chosen");
  const unknownTimeBox = document.getElementById("f-unknown-time");
  const timeInput = document.getElementById("f-time");
  const unknownWarning = document.getElementById("unknown-time-warning");

  unknownTimeBox.addEventListener("change", () => {
    timeInput.disabled = unknownTimeBox.checked;
    unknownWarning.style.display = unknownTimeBox.checked ? "" : "none";
    if (unknownTimeBox.checked) timeInput.value = "12:00";
  });

  let searchTimer = null;
  locationInput.addEventListener("input", () => {
    chosenLocation = null;
    clearTimeout(searchTimer);
    const q = locationInput.value;
    if (q.trim().length < 2) {
      resultsBox.style.display = "none";
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const results = await searchPlaces(q);
        if (!results.length) {
          resultsBox.innerHTML = `<div style="padding:10px 12px;color:var(--ink-soft)">No matches</div>`;
          resultsBox.style.display = "";
          return;
        }
        resultsBox.innerHTML = results
          .map(
            (r, i) =>
              `<button type="button" data-idx="${i}">${esc(r.label)} <span style="color:var(--ink-soft);font-size:0.8em">${esc(r.timezone)}</span></button>`
          )
          .join("");
        resultsBox.style.display = "";
        resultsBox.querySelectorAll("button").forEach((btn) => {
          btn.addEventListener("click", () => {
            const r = results[Number(btn.dataset.idx)];
            chosenLocation = r;
            locationInput.value = r.label;
            chosenBox.textContent = `Selected: ${r.label} (${r.timezone})`;
            resultsBox.style.display = "none";
          });
        });
      } catch (err) {
        resultsBox.innerHTML = `<div style="padding:10px 12px;color:var(--red)">Location search failed: ${esc(err.message)}</div>`;
        resultsBox.style.display = "";
      }
    }, 350);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("form-error");
    errorEl.textContent = "";
    const name = document.getElementById("f-name").value.trim();
    const dateVal = document.getElementById("f-date").value;
    const unknownTime = unknownTimeBox.checked;
    const timeVal = unknownTime ? "12:00" : document.getElementById("f-time").value;
    if (!name || !dateVal || !timeVal) {
      errorEl.textContent = "Please fill in all fields.";
      return;
    }
    if (!chosenLocation) {
      errorEl.textContent = "Please choose a location from the search results.";
      return;
    }
    const [year, month, day] = dateVal.split("-").map(Number);
    const [hour, minute] = timeVal.split(":").map(Number);

    const { utcDate, offsetMinutes } = localToUtc({ year, month, day, hour, minute }, chosenLocation.timezone);

    const person = {
      id: existing?.id ?? Storage.uid(),
      name,
      createdAt: existing?.createdAt ?? Date.now(),
      birth: {
        year,
        month,
        day,
        hour,
        minute,
        unknownTime,
        locationLabel: chosenLocation.label,
        latitude: chosenLocation.latitude,
        longitude: chosenLocation.longitude,
        timezone: chosenLocation.timezone,
        utcOffsetMinutes: offsetMinutes,
        utcISO: utcDate.toISOString(),
      },
    };
    Storage.savePerson(person);
    navigate(`person/${person.id}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Person chart view
// ─────────────────────────────────────────────────────────────────────────
function renderPersonView(id) {
  const person = Storage.getPerson(id);
  if (!person) return renderHome();
  const { chart, astrology } = getChartFor(person);
  const svg = renderBodyGraphSvg(chart, { title: person.name });

  const activePointsTable = (side) => {
    const rows = Object.entries(chart[side])
      .map(([planet, act]) => {
        const gname = GATE_NAMES[act.gate];
        return `<tr><td>${planet.replace(/([A-Z])/g, " $1").trim()}</td><td>${act.gate}.${act.line}</td><td>${esc(gname?.[0] ?? "")}</td></tr>`;
      })
      .join("");
    return `<table class="data"><thead><tr><th>Point</th><th>Gate.Line</th><th>Gate Name</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  const centersHtml = Object.keys(CENTERS)
    .map((c) => {
      const defined = chart.definedCenters.includes(c);
      return `<li><span>${c} <span class="disclaimer">— ${esc(CENTER_DESCRIPTIONS[c])}</span></span><span class="status ${defined ? "defined" : "open"}">${defined ? "Defined" : "Open"}</span></li>`;
    })
    .join("");

  const bulletList = (items) => `<ul style="margin:6px 0 0;padding-left:1.2em">${items.map((i) => `<li style="margin-bottom:3px">${esc(i)}</li>`).join("")}</ul>`;

  const typeDepthHtml = `
    <div class="card" style="margin-bottom:16px">
      <span class="eyebrow">${chart.type} — In Depth</span>
      <p><strong>On track:</strong> ${esc(chart.typeInfo.onTrack)}</p>
      <p><strong>Off track:</strong> ${esc(chart.typeInfo.offTrack)}</p>
      <p class="disclaimer" style="margin-bottom:4px"><strong>What the ${esc(chart.typeInfo.notSelfTheme)} talk sounds like:</strong></p>
      ${bulletList(chart.typeInfo.notSelfTalk)}
    </div>`;

  const profileNarrative = PROFILE_NARRATIVES[chart.profile];
  const profileDepthHtml = profileNarrative
    ? `<div class="card" style="margin-bottom:16px"><span class="eyebrow">Profile ${chart.profile} — ${esc(chart.incarnationCross.profileName)}</span><p style="margin-bottom:0">${esc(profileNarrative)}</p></div>`
    : "";

  const centerDepthCard = (center) => {
    const isDefined = chart.definedCenters.includes(center);
    const narrative = CENTER_NARRATIVES[center];
    if (!narrative) return "";
    if (isDefined) {
      const d = narrative.defined;
      return `<div class="card" style="margin-bottom:12px">
        <span class="eyebrow">${esc(center)} — Defined</span>
        <p>${esc(d.summary)}</p>
        <p><strong>Well expressed:</strong> ${esc(d.wellExpressed)}</p>
        <p style="margin-bottom:0"><strong>Under pressure:</strong> ${esc(d.underPressure)}</p>
      </div>`;
    }
    const o = narrative.open;
    const flavor = chart.openCenterFlavor?.[center];
    const flavorNote =
      flavor?.kind === "flavored"
        ? `<p class="disclaimer">Gate${flavor.gates.length > 1 ? "s" : ""} ${flavor.gates.map((g) => `${g} (${esc(GATE_NAMES[g]?.[0] ?? "")})`).join(", ")} ${flavor.gates.length > 1 ? "are" : "is"} active here without ${flavor.gates.length > 1 ? "their" : "its"} channel partner — this open center carries a specific flavor rather than being a total blank.</p>`
        : `<p class="disclaimer">No gate at all is active here — completely open, with no built-in filter whatsoever on this theme.</p>`;
    return `<div class="card" style="margin-bottom:12px">
      <span class="eyebrow">${esc(center)} — Open</span>
      <p>${esc(o.summary)}</p>
      ${flavorNote}
      <p class="disclaimer" style="margin-bottom:4px"><strong>Not-Self Theme:</strong> ${esc(o.notSelfTheme)}</p>
      ${bulletList(o.notSelfTalk)}
      <p style="margin:10px 0 0"><strong>Reflection:</strong> ${esc(o.reflectionQuestion)}</p>
      <p style="margin-bottom:0"><strong>The Gift:</strong> ${esc(o.gift)}</p>
    </div>`;
  };

  const centersDepthHtml = [
    ...chart.definedCenters.slice().sort(),
    ...chart.undefinedCenters.slice().sort(),
  ]
    .map(centerDepthCard)
    .join("");

  const channelsHtml = chart.formedChannels.length
    ? `<ul class="center-list">${chart.formedChannels.map((c) => `<li><span>${c.gates.join("-")} — ${esc(c.name)}</span><span class="disclaimer">${c.centers.join(" ↔ ")}</span></li>`).join("")}</ul>`
    : `<p class="disclaimer">No fully formed channels — every active gate is a "hanging gate," waiting for the matching gate from someone else to complete a circuit.</p>`;

  const channelsDepthHtml = chart.formedChannels.length
    ? chart.formedChannels
        .map((c) => {
          const key = c.gates.slice().sort((a, b) => a - b).join("-");
          const desc = CHANNEL_DESCRIPTIONS[key];
          return `<div class="card" style="margin-bottom:12px">
            <span class="eyebrow">${c.gates.join("-")} — ${esc(c.name)} <span class="disclaimer">(${c.centers.join(" ↔ ")})</span></span>
            <p style="margin-bottom:0">${esc(desc ?? "")}</p>
          </div>`;
        })
        .join("")
    : `<p class="disclaimer">No fully formed channels — every active gate here is a "hanging gate," waiting for the matching gate from someone else to complete a circuit between you.</p>`;

  const gatesDepthHtml = chart.activeGates
    .map((g) => {
      const [name] = GATE_NAMES[g] ?? [];
      const desc = GATE_DESCRIPTIONS[g];
      const side = chart.gateSides[g];
      const sideLabel = side?.personality && side?.design ? "Personality &amp; Design" : side?.personality ? "Personality" : "Design";
      return `<div class="card" style="margin-bottom:12px">
        <span class="eyebrow">Gate ${g} — ${esc(name ?? "")} <span class="disclaimer">(${sideLabel})</span></span>
        <p style="margin-bottom:0">${esc(desc ?? "")}</p>
      </div>`;
    })
    .join("");

  let astrologyHtml = `<p class="disclaimer">Add a birth location to see the astrology snapshot.</p>`;
  if (astrology) {
    const sun = astrology.placements.Sun;
    const moon = astrology.placements.Moon;
    astrologyHtml = `
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card"><span class="eyebrow">Sun</span><h3>${sun.sign} ${sun.degreeInSign.toFixed(1)}°</h3></div>
        <div class="card"><span class="eyebrow">Moon</span><h3>${moon.sign} ${moon.degreeInSign.toFixed(1)}°</h3></div>
        <div class="card"><span class="eyebrow">Ascendant</span><h3>${astrology.ascendant ? `${astrology.ascendant.sign} ${astrology.ascendant.degreeInSign.toFixed(1)}°` : "—"}</h3></div>
      </div>
      <table class="data">
        <thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>House</th></tr></thead>
        <tbody>${Object.entries(astrology.placements)
          .map(([name, p]) => `<tr><td>${name}</td><td>${p.sign}</td><td>${p.degreeInSign.toFixed(2)}°</td><td>${p.house ?? "—"}</td></tr>`)
          .join("")}</tbody>
      </table>
      <hr class="rule">
      <span class="eyebrow">Major Aspects</span>
      <table class="data">
        <thead><tr><th>Pair</th><th>Aspect</th><th>Orb</th></tr></thead>
        <tbody>${astrology.aspects
          .slice(0, 14)
          .map((a) => `<tr><td>${a.a} ${a.symbol} ${a.b}</td><td>${a.aspect}</td><td>${a.orb}°</td></tr>`)
          .join("")}</tbody>
      </table>
    `;
  }

  layout(
    `
    <div class="chart-header">
      <div>
        <span class="eyebrow">${esc(person.birth.locationLabel)} · ${person.birth.month}/${person.birth.day}/${person.birth.year} ${person.birth.unknownTime ? "(time unknown)" : `${String(person.birth.hour).padStart(2, "0")}:${String(person.birth.minute).padStart(2, "0")}`}</span>
        <h1>${esc(person.name)}</h1>
      </div>
      <div class="card-actions">
        <a href="#/person/${person.id}/edit" class="btn small">Edit</a>
        <button class="btn small danger" id="delete-person">Delete</button>
      </div>
    </div>
    ${person.birth.unknownTime ? `<div class="callout warn"><p style="margin-bottom:0">Birth time unknown — Moon placement, Ascendant, and possibly Authority should be treated as approximate.</p></div>` : ""}

    <div class="card" style="margin:20px 0 24px">
      <span class="eyebrow">Chart Snapshot</span>
      <div class="grid grid-3" style="margin-bottom:18px">
        <div><span class="eyebrow">Type</span><h3 style="margin-bottom:2px">${chart.type}</h3><span class="disclaimer">${chart.typeInfo.population} of people</span></div>
        <div><span class="eyebrow">Strategy</span><h3 style="margin-bottom:0">${chart.typeInfo.strategy}</h3></div>
        <div><span class="eyebrow">Authority</span><h3 style="margin-bottom:0">${chart.authority.name}</h3></div>
        <div><span class="eyebrow">Profile</span><h3 style="margin-bottom:2px">${chart.profile}</h3><span class="disclaimer">${esc(chart.incarnationCross.profileName)}</span></div>
        <div><span class="eyebrow">Definition</span><h3 style="margin-bottom:2px">${chart.definition}</h3><span class="disclaimer">${chart.definitionComponents.length} connected ${chart.definitionComponents.length === 1 ? "group" : "groups"}</span></div>
        <div><span class="eyebrow">Incarnation Cross</span><h3 style="margin-bottom:0;font-size:1.02rem">${chart.incarnationCross.label}</h3></div>
      </div>
      <hr class="rule" style="margin:0 0 16px">
      <p style="margin-bottom:0">This chart is calculated from ${esc(person.name)}'s exact birth date, time, and place, combined with where the planets sat in the sky at that moment — no two combinations are the same. The BodyGraph below is nine geometric shapes (Centers) connected by lines (Channels), built from gates — the specific activation points at each end. A filled-in Center runs on a fixed, reliable current; a white one is open, meaning it picks up and amplifies whatever energy is around it. Everything on this page breaks down exactly what that means for ${esc(person.name)}.</p>
    </div>

    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="card bodygraph-wrap">${svg}
        <p class="disclaimer" style="margin-top:12px">
          <span class="legend-dot" style="background:${COLOR_PERSONALITY}"></span>Personality (conscious)
          &nbsp;&nbsp;<span class="legend-dot" style="background:${COLOR_DESIGN}"></span>Design (unconscious)
          &nbsp;&nbsp;<span class="legend-dot" style="background:${COLOR_BOTH}"></span>Both
        </p>
      </div>
      <div class="card">
        <span class="eyebrow">What this means</span>
        <p>${esc(chart.typeInfo.summary)}</p>
        <p><strong>Signature:</strong> ${chart.typeInfo.signature} &nbsp;·&nbsp; <strong>Not-Self Theme:</strong> ${chart.typeInfo.notSelfTheme}</p>
        <p>${esc(chart.authority.guidance)}</p>
        <p class="disclaimer" style="margin-bottom:0">${esc(chart.definitionText)}</p>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="card">
        <span class="eyebrow">Centers</span>
        <ul class="center-list">${centersHtml}</ul>
      </div>
      <div class="card">
        <span class="eyebrow">Formed Channels (${chart.formedChannels.length})</span>
        ${channelsHtml}
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="card"><span class="eyebrow">Personality — Conscious</span>${activePointsTable("personality")}</div>
      <div class="card"><span class="eyebrow">Design — Unconscious</span>${activePointsTable("design")}</div>
    </div>

    <hr class="rule">
    <span class="eyebrow">In Depth</span>
    <h2>${esc(person.name)}'s Type, Profile &amp; Centers</h2>
    ${typeDepthHtml}
    ${profileDepthHtml}
    <div class="grid grid-2">${centersDepthHtml}</div>

    <hr class="rule">
    <span class="eyebrow">Section 7</span>
    <h2>${esc(person.name)}'s Channels</h2>
    <p>A channel forms when both of its gates are active — a live, consistent circuit connecting two centers. This is the energy ${esc(person.name)} carries reliably, not just on their good days.</p>
    ${channelsDepthHtml}

    <hr class="rule">
    <span class="eyebrow">Section 8</span>
    <h2>${esc(person.name)}'s Gates</h2>
    <p>All ${chart.activeGates.length} of ${esc(person.name)}'s activated gates — the specific themes that make up their design, whether or not they've completed a channel yet.</p>
    <div class="grid grid-2">${gatesDepthHtml}</div>

    <hr class="rule">
    <span class="eyebrow">Astrology Snapshot</span>
    <h2>Natal Chart</h2>
    ${astrologyHtml}
    `
  );

  document.getElementById("delete-person")?.addEventListener("click", () => {
    if (confirm(`Delete ${person.name}'s chart? This can't be undone.`)) {
      Storage.deletePerson(person.id);
      navigate("");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Circle form (new / edit)
// ─────────────────────────────────────────────────────────────────────────
function renderCircleForm(existing) {
  const isEdit = !!existing;
  const people = Storage.getPeople();

  layout(
    `
    <span class="eyebrow">${isEdit ? "Edit" : "New"} Circle</span>
    <h1>${isEdit ? "Edit Brotherhood Circle" : "Build a Brotherhood Circle"}</h1>
    <p>Pick two or more saved charts. You'll get a shared BodyGraph breakdown, who carries what for the group, and the specific connections between each pair.</p>
    ${
      people.length < 2
        ? `<div class="callout warn"><p style="margin-bottom:0">You need at least two saved charts first. <a href="#/person/new">Add a chart</a>.</p></div>`
        : `<form id="circle-form" class="card" style="max-width:640px">
        <div class="field">
          <label for="c-name">Circle name</label>
          <input type="text" id="c-name" required value="${esc(existing?.name ?? "")}">
        </div>
        <div class="field">
          <label>Members</label>
          <div class="tag-select">
            ${people
              .map(
                (p) =>
                  `<label class="${existing?.memberIds.includes(p.id) ? "checked" : ""}"><input type="checkbox" value="${p.id}" ${existing?.memberIds.includes(p.id) ? "checked" : ""}> ${esc(p.name)}</label>`
              )
              .join("")}
          </div>
        </div>
        <button type="submit" class="btn primary">${isEdit ? "Save changes" : "Build circle"}</button>
        <span id="circle-error" style="color:var(--red);margin-left:12px"></span>
      </form>`
    }
    `
  );

  const form = document.getElementById("circle-form");
  if (!form) return;
  form.querySelectorAll(".tag-select label").forEach((label) => {
    const input = label.querySelector("input");
    input.addEventListener("change", () => label.classList.toggle("checked", input.checked));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("c-name").value.trim();
    const memberIds = [...form.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
    const errorEl = document.getElementById("circle-error");
    if (!name) return void (errorEl.textContent = "Please name the circle.");
    if (memberIds.length < 2) return void (errorEl.textContent = "Pick at least two members.");
    const circle = { id: existing?.id ?? Storage.uid(), name, memberIds, createdAt: existing?.createdAt ?? Date.now() };
    Storage.saveCircle(circle);
    navigate(`circle/${circle.id}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Circle view
// ─────────────────────────────────────────────────────────────────────────
function renderCircleView(id) {
  const circle = Storage.getCircle(id);
  if (!circle) return renderHome();
  const members = circle.memberIds
    .map((mid) => Storage.getPerson(mid))
    .filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, person: p, chart: getChartFor(p).chart }));

  if (members.length < 2) {
    layout(`<p>This circle needs at least two members. <a href="#/circle/${circle.id}/edit">Edit membership</a>.</p>`);
    return;
  }

  const composite = computeGroupComposite(members);
  const tally = centerDefinitionTally(members);
  const pairs = pairwiseConnections(members);
  const narrative = buildCircleNarrative(members, composite, tally, pairs);

  const memberCards = members
    .map(
      (m) => `<div class="card person-card" data-nav="#/person/${m.id}">
        <span class="name">${esc(m.name)}</span>
        <div><span class="pill type">${m.chart.type}</span><span class="pill authority">${m.chart.authority.name}</span><span class="pill profile">${m.chart.profile}</span></div>
      </div>`
    )
    .join("");

  const tallyRows = Object.entries(tally)
    .map(([center, t]) => {
      const pct = Math.round((t.count / members.length) * 100);
      return `<li><span>${center}</span><span class="disclaimer">${t.count}/${members.length} defined ${t.count ? `— ${esc(t.members.join(", "))}` : ""}</span></li>`;
    })
    .join("");

  const noteCards = narrative.notes
    .map((n) => `<div class="note-card ${n.kind}"><strong>${esc(n.title)}</strong><p style="margin:6px 0 0">${esc(n.text)}</p></div>`)
    .join("");

  const typeLines = narrative.typeLines.map((t) => `<p>${esc(t)}</p>`).join("");
  const highlights = narrative.highlights.length
    ? `<div class="stack-sm">${narrative.highlights.map((h) => `<div class="note-card info"><p style="margin:0">${esc(h)}</p></div>`).join("")}</div>`
    : `<p class="disclaimer">No electromagnetic (new-circuit) connections between pairs in this circle.</p>`;

  const pairTable = pairs
    .map((p) => {
      const counts = Object.entries(p.connections)
        .filter(([, v]) => v.length)
        .map(([k, v]) => `${k} (${v.length})`)
        .join(", ");
      return `<tr><td>${esc(p.a)} ↔ ${esc(p.b)}</td><td>${counts || "—"}</td></tr>`;
    })
    .join("");

  const compositeSvg = renderBodyGraphSvg(
    { ...composite, gateSides: Object.fromEntries(composite.activeGates.map((g) => [g, { personality: true, design: true }])) },
    { title: circle.name }
  );

  layout(
    `
    <div class="chart-header">
      <div>
        <span class="eyebrow">Brotherhood Circle · ${members.length} members</span>
        <h1>${esc(circle.name)}</h1>
      </div>
      <div class="card-actions">
        <a href="#/circle/${circle.id}/edit" class="btn small">Edit membership</a>
        <button class="btn small danger" id="delete-circle">Delete</button>
      </div>
    </div>

    <div class="grid grid-3" style="margin:20px 0">${memberCards}</div>

    <hr class="rule">
    <span class="eyebrow">How This Group Works Together</span>
    <h2>Synthesis</h2>
    <div class="stack-sm">${noteCards || '<p class="disclaimer">No standout patterns — this group\'s definition is fairly evenly spread.</p>'}</div>
    <div class="stack-sm" style="margin-top:16px">${typeLines}</div>

    <hr class="rule">
    <span class="eyebrow">Group Composite BodyGraph</span>
    <h2>Pooled Definition</h2>
    <p>What the circle has access to when everyone's gates are combined — including centers no single member holds alone.</p>
    <div class="grid grid-2">
      <div class="card bodygraph-wrap">${compositeSvg}</div>
      <div class="card">
        <span class="eyebrow">Center-by-center</span>
        <ul class="center-list">${tallyRows}</ul>
      </div>
    </div>

    <hr class="rule">
    <span class="eyebrow">Connection Theory</span>
    <h2>Between Each Pair</h2>
    <p>For every pair, the standard four Human Design connection types: <strong>Companionship</strong> (both already carry the same channel — easy, shared ground), <strong>Dominance</strong> (one carries a full channel the other doesn't touch at all — a one-way current), <strong>Electromagnetic</strong> (neither has it alone, but together they complete it — real chemistry, sometimes hard to explain), and <strong>Compromise</strong> (both share the exact same half-open gate — a live but never-finished theme between them).</p>
    ${highlights}
    <table class="data" style="margin-top:12px">
      <thead><tr><th>Pair</th><th>Connections found</th></tr></thead>
      <tbody>${pairTable}</tbody>
    </table>

    <div class="callout note" style="margin-top:24px">
      <p style="margin-bottom:0">This is a starting point for a real conversation among the men in this circle — not a verdict on anyone. Use it to notice patterns worth naming out loud together.</p>
    </div>
    `
  );
  bindNavClicks();
  document.getElementById("delete-circle")?.addEventListener("click", () => {
    if (confirm(`Delete the "${circle.name}" circle? Members' individual charts are kept.`)) {
      Storage.deleteCircle(circle.id);
      navigate("");
    }
  });
}

render();
