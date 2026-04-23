const N_VALUES = [10, 100, 1000, 10000];

function openAnalysisModal() {
  document.getElementById("analysis-modal").classList.remove("hidden");
  runBatchAnalysis();
}

function closeAnalysisModal() {
  document.getElementById("analysis-modal").classList.add("hidden");
}

async function runBatchAnalysis() {
  const discreteTbody = document.getElementById("modal-table-discrete");
  const normalTbody = document.getElementById("modal-table-normal");

  // loading state
  discreteTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500 font-semibold animate-pulse">Running discrete simulations...</td></tr>`;
  normalTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500 font-semibold animate-pulse">Running normal simulations...</td></tr>`;

  // get current inputs from the main UI
  const probs = [];
  for (let i = 1; i <= 5; i++) {
    probs.push(parseFloat(document.getElementById(`p${i}`).value));
  }
  const mean = parseFloat(document.getElementById("normal-mean").value);
  const variance = parseFloat(document.getElementById("normal-var").value);

  // fetch data for all N values
  let discreteHTML = "";
  let normalHTML = "";

  for (const n of N_VALUES) {
    // run both APIs concurrently for the current N
    const [discreteRes, normalRes] = await Promise.all([
      fetch(`${API_BASE}/discrete`, {
        method: "POST",
        body: JSON.stringify({ probs, n }),
      }).then((r) => r.json()),

      fetch(`${API_BASE}/normal`, {
        method: "POST",
        body: JSON.stringify({ mean, variance, n }),
      }).then((r) => r.json()),
    ]);

    // build table rows
    discreteHTML += buildTableRow(n, discreteRes);
    normalHTML += buildTableRow(n, normalRes);
  }

  discreteTbody.innerHTML = discreteHTML;
  normalTbody.innerHTML = normalHTML;
}

function buildTableRow(n, data) {
  const isPassed = data.passed;
  const resultBadge = isPassed
    ? `<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-bold">Passed (Accept H0)</span>`
    : `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-bold">Неуспешный (Reject H0)</span>`;

  return `
        <tr class="hover:bg-gray-50">
            <td class="py-2 px-4 border-b font-bold">${n}</td>
            <td class="py-2 px-4 border-b">
                ${data.mean.toFixed(3)}
                <span class="text-gray-500 text-sm">(${data.meanErr.toFixed(2)}%)</span>
            </td>
            <td class="py-2 px-4 border-b">
                ${data.variance.toFixed(3)}
                <span class="text-gray-500 text-sm">(${data.varErr.toFixed(2)}%)</span>
            </td>
            <td class="py-2 px-4 border-b">
                ${data.chiSq.toFixed(2)}
                <span class="text-xs text-gray-400">&lt; ${data.critVal.toFixed(2)}</span>
            </td>
            <td class="py-2 px-4 border-b">${resultBadge}</td>
        </tr>
    `;
}
