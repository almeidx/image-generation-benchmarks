/* global Chart */

const PALETTE = [
	"#6366f1",
	"#ec4899",
	"#22d3ee",
	"#10b981",
	"#f59e0b",
	"#a78bfa",
	"#f87171",
	"#34d399",
];
const REPO_URL = "https://github.com/almeidx/image-generation-benchmarks";

const $ = (id) => document.getElementById(id);
const ms = (ns) => ns / 1e6;
const fmtMs = (ns) => (ms(ns) >= 100 ? ms(ns).toFixed(0) : ms(ns).toPrecision(3)) + " ms";

let data;
let benchChart;
let coldChart;

const runtimeLabel = (run) => `${run.runtime.name} ${run.runtime.version}`;

async function init() {
	const res = await fetch("./data.json");
	if (!res.ok) {
		$("meta").textContent = "No published results yet — run the GitHub Actions benchmark workflow.";
		return;
	}
	data = await res.json();
	$("repo-link").href = REPO_URL;
	$("meta").textContent =
		`Generated ${new Date(data.generated).toLocaleString()} · ` +
		`${data.runs.map(runtimeLabel).join(" · ")} · ${data.runs[0].platform.cpu}` +
		(data.commit ? ` · commit ${data.commit.slice(0, 7)}` : "");

	const scenarios = [...new Set(data.runs.flatMap((r) => r.benchmarks.map((b) => b.scenario)))];
	const formats = [...new Set(data.runs.flatMap((r) => r.benchmarks.map((b) => b.format)))];

	for (const s of scenarios) $("scenario-select").append(new Option(s, s));
	for (const f of formats) $("format-select").append(new Option(f, f));
	$("scenario-select").value = scenarios.includes("og-card") ? "og-card" : scenarios[0];
	$("scenario-select").addEventListener("change", renderBench);
	$("format-select").addEventListener("change", renderBench);

	for (const r of data.runs)
		$("coldstart-runtime").append(new Option(runtimeLabel(r), runtimeLabel(r)));
	$("coldstart-runtime").addEventListener("change", renderColdStart);

	renderBench();
	renderColdStart();
	renderSupport();
	renderSimilarity();
}

function benchRows(scenario, format) {
	const adapters = [...new Set(data.runs.flatMap((r) => Object.keys(r.libraries)))];
	return adapters
		.map((adapter) => ({
			adapter,
			cells: data.runs.map((r) =>
				r.benchmarks.find(
					(b) => b.adapter === adapter && b.scenario === scenario && b.format === format,
				),
			),
		}))
		.filter((row) => row.cells.some(Boolean));
}

function renderBench() {
	const scenario = $("scenario-select").value;
	const format = $("format-select").value;
	const rows = benchRows(scenario, format);

	const datasets = data.runs.map((run, i) => ({
		label: runtimeLabel(run),
		data: rows.map((row) => (row.cells[i] ? ms(row.cells[i].stats.avgNs) : null)),
		backgroundColor: PALETTE[i % PALETTE.length],
	}));

	benchChart?.destroy();
	benchChart = new Chart($("bench-chart"), {
		type: "bar",
		data: { labels: rows.map((r) => r.adapter), datasets },
		options: {
			indexAxis: "y",
			scales: {
				x: {
					title: { display: true, text: "mean ms (log scale)" },
					type: "logarithmic",
					ticks: { color: "#94a3b8" },
					grid: { color: "#334155" },
				},
				y: { ticks: { color: "#e2e8f0" }, grid: { color: "#334155" } },
			},
			plugins: { legend: { labels: { color: "#e2e8f0" } } },
		},
	});

	const best = data.runs.map((_, i) => {
		const vals = rows.map((r) => r.cells[i]?.stats.avgNs).filter((v) => v !== undefined);
		return vals.length ? Math.min(...vals) : undefined;
	});
	$("bench-table").innerHTML = `
    <table>
      <thead><tr><th>Library</th>${data.runs.map((r) => `<th>${runtimeLabel(r)}</th>`).join("")}</tr></thead>
      <tbody>${rows
				.map(
					(row) =>
						`<tr><td>${row.adapter}</td>${row.cells
							.map((cell, i) =>
								cell
									? `<td class="${cell.stats.avgNs === best[i] ? "best" : ""}">${fmtMs(cell.stats.avgNs)}</td>`
									: "<td>—</td>",
							)
							.join("")}</tr>`,
				)
				.join("")}</tbody>
    </table>`;

	renderGallery(scenario);
}

function renderColdStart() {
	const run =
		data.runs.find((r) => runtimeLabel(r) === $("coldstart-runtime").value) ?? data.runs[0];
	const adapters = Object.entries(run.libraries).filter(([, info]) => info.setup);
	const phases = [
		["import", (s) => s.importMs],
		["fonts", (s) => s.fontsMs],
		["images", (s) => s.assetsMs],
		["first render", (s) => s.firstRenderMs],
	];
	coldChart?.destroy();
	coldChart = new Chart($("coldstart-chart"), {
		type: "bar",
		data: {
			labels: adapters.map(([name]) => name),
			datasets: phases.map(([label, pick], i) => ({
				label,
				data: adapters.map(([, info]) => pick(info.setup)),
				backgroundColor: PALETTE[i % PALETTE.length],
			})),
		},
		options: {
			indexAxis: "y",
			scales: {
				x: {
					stacked: true,
					title: { display: true, text: "ms" },
					ticks: { color: "#94a3b8" },
					grid: { color: "#334155" },
				},
				y: { stacked: true, ticks: { color: "#e2e8f0" }, grid: { color: "#334155" } },
			},
			plugins: { legend: { labels: { color: "#e2e8f0" } } },
		},
	});
}

function renderSupport() {
	const adapters = [...new Set(data.runs.flatMap((r) => Object.keys(r.libraries)))];
	$("support-table").innerHTML = `
    <table>
      <thead><tr><th>Library</th><th>Version</th>${data.runs.map((r) => `<th>${runtimeLabel(r)}</th>`).join("")}</tr></thead>
      <tbody>${adapters
				.map((adapter) => {
					const version = data.runs.map((r) => r.libraries[adapter]?.version).find(Boolean) ?? "?";
					const cells = data.runs
						.map((r) => {
							const info = r.libraries[adapter];
							return `<td>${!info ? "—" : info.status === "ok" ? "✅" : `❌ <span class="muted">${(info.error ?? "").slice(0, 60)}</span>`}</td>`;
						})
						.join("");
					return `<tr><td>${adapter}</td><td>${version}</td>${cells}</tr>`;
				})
				.join("")}</tbody>
    </table>`;
}

function renderGallery(scenario) {
	const adapters = [...new Set(data.runs.flatMap((r) => Object.keys(r.libraries)))];
	$("gallery").innerHTML = adapters
		.map(
			(adapter) => `
      <figure>
        <img src="./gallery/outputs/${adapter}/${scenario}.png" alt="${adapter} ${scenario}"
             loading="lazy" onerror="this.parentElement.style.display='none'" />
        <figcaption>${adapter}</figcaption>
      </figure>`,
		)
		.join("");
}

function renderSimilarity() {
	const v = data.validations?.[0];
	if (!v || v.crossLibrary.length === 0) {
		$("similarity-table").innerHTML = '<span class="muted">No validation data in this run.</span>';
		return;
	}
	const scenarios = [...new Set(v.crossLibrary.map((c) => c.scenario))];
	$("similarity-table").innerHTML = scenarios
		.map((scenario) => {
			const pairs = v.crossLibrary
				.filter((c) => c.scenario === scenario)
				.toSorted((a, b) => b.diffRatio - a.diffRatio);
			return `
        <h3 style="font-size:1rem;margin:1rem 0 0.25rem">${scenario}</h3>
        <table>
          <thead><tr><th>Pair</th><th>Pixels differing</th></tr></thead>
          <tbody>${pairs
						.map(
							(p) =>
								`<tr><td>${p.adapterA} ↔ ${p.adapterB}</td><td>${(p.diffRatio * 100).toFixed(2)}%</td></tr>`,
						)
						.join("")}</tbody>
        </table>`;
		})
		.join("");
}

init();
