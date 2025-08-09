
/* ====== グローバル ====== */
let lastSimData = [];
let rateChartInstance = null;
let paymentChart = null, stackedChart = null;

/* ====== 入出力同期（万円） ====== */
function syncAmountFromRange() {
  const val = parseInt(document.getElementById('amount-range').value);
  document.getElementById('amount').value = val.toLocaleString();
}
function syncAmountFromText() {
  const raw = document.getElementById('amount').value.replace(/[^\d]/g, '');
  const num = parseInt(raw || '0');
  document.getElementById('amount-range').value = num;
  document.getElementById('amount').value = num.toLocaleString();
}
function syncYearsFromRange() {
  const val = parseInt(document.getElementById('years-range').value);
  document.getElementById('years').value = val;
  generateRateInputs();
}
function syncYearsFromInput() {
  const val = parseInt(document.getElementById('years').value);
  document.getElementById('years-range').value = val;
  generateRateInputs();
}
function parseAmount(v){ return parseFloat(v.replace(/,/g, '')) * 10000; } // 万円→円

/* ====== 金利入力生成 ====== */
function generateRateInputs() {
  const container = document.getElementById('rate-inputs');
  container.innerHTML = '';
  const years = parseInt(document.getElementById('years').value);
  const fromYearSelect = document.getElementById('from-year');
  fromYearSelect.innerHTML = '';

  for (let y = 1; y <= years; y++) {
    const option = document.createElement('option');
    option.value = y; option.textContent = `${y} 年目以降`; fromYearSelect.appendChild(option);

    const row = document.createElement('div'); row.className = 'rate-input-row';
    const label = document.createElement('span'); label.textContent = `${y}年目`;
    const input1 = document.createElement('input'); const input2 = document.createElement('input');
    [input1, input2].forEach((input, i) => {
      input.type = 'number'; input.step = '0.01'; input.value = '1.00'; input.className = 'rate-input';
      input.dataset.index = (y - 1) * 2 + i; input.addEventListener('input', updateRateChartFromInputs);
    });
    row.appendChild(label); row.appendChild(input1); row.appendChild(input2); container.appendChild(row);
  }
  drawRateChart();
}

/* ====== 入力→グラフ ====== */
function updateRateChartFromInputs() {
  const inputs = Array.from(document.querySelectorAll('.rate-input'));
  const rates = inputs.map(el => parseFloat(el.value) || 0);
  if (rateChartInstance) {
    rateChartInstance.data.labels = rates.map((_, i) => `${Math.floor(i/2)+1}年目`);
    rateChartInstance.data.datasets[0].data = rates;
    rateChartInstance.update();
  }
}

/* ====== グラフ→入力 ====== */
function updateInputsFromRateChart(rates) {
  const inputs = document.querySelectorAll('.rate-input');
  rates.forEach((r,i)=>{ inputs[i].value = parseFloat(r).toFixed(2); });
  simulate();
}

/* ====== 一括適用 ====== */
function applyBulkRate() {
  const rate = parseFloat(document.getElementById('bulk-rate').value);
  if (isNaN(rate)) return alert('有効な金利を入力してください。');
  document.querySelectorAll('.rate-input').forEach(inp => inp.value = rate.toFixed(2));
  updateRateChartFromInputs();
}
function applyRateFromYear() {
  const fromYear = parseInt(document.getElementById('from-year').value);
  const rate = parseFloat(document.getElementById('from-rate').value);
  if (isNaN(rate)) return alert('有効な金利を入力してください。');
  const inputs = document.querySelectorAll('.rate-input');
  const startIndex = (fromYear - 1) * 2;
  for (let i = startIndex; i < inputs.length; i++) inputs[i].value = rate.toFixed(2);
  updateRateChartFromInputs();
}

/* ====== ドラッグ編集グラフ（X=1年置き/Y最大8%） ====== */
function drawRateChart() {
  const inputs = Array.from(document.querySelectorAll('.rate-input'));
  const rates = inputs.map(el => parseFloat(el.value) || 0);
  const ctx = document.getElementById('rateChart').getContext('2d');
  if (rateChartInstance) rateChartInstance.destroy();

  rateChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: rates.map((_,i)=>`${Math.floor(i/2)+1}年目`),
      datasets: [{
        label: '半年ごとの金利（％）',
        data: rates,
        borderColor: '#0c7e86',
        backgroundColor: 'rgba(12,126,134,0.12)',
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 14,
        borderWidth: 3,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          grid: { display:false },
          title: { display:true, text:'何年目', color:'#0e2a47', font:{weight:'bold'} },
          ticks: {
            autoSkip:false, maxRotation:0, font:{ size:14 },
            callback: (value, index) => (index % 2 === 1) ? Math.floor(index/2)+1 : ''
          }
        },
        y: {
          beginAtZero:true, min:0, max:8,
          grid:{ color: 'rgba(0,0,0,0.08)' },
          ticks:{ font:{ size:14 }, callback: v => Number(v).toFixed(1) + '%' }
        }
      },
      plugins: {
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#0e2a47', titleColor:'#fff', bodyColor:'#fff',
          callbacks:{
            title:(items)=>{ const i=items[0].dataIndex; return `${Math.floor(i/2)+1}年目（${i%2===0?'前半':'後半'}）`; },
            label:(ctx)=>`金利: ${Number(ctx.parsed.y).toFixed(2)}%`
          }
        },
        dragData:{
          round:2, showTooltip:true,
          onDragEnd:(e,datasetIndex,index,value)=>{
            value = Math.max(0, Math.min(8, value)); // 0〜8%に制限
            const oldData = rateChartInstance.data.datasets[0].data;
            const newRates = [...oldData];
            const len = newRates.length;
            const SMOOTH_PRE_RANGE = 3; // 直前3ポイント

            // 以降は同じ値
            for (let i=index;i<len;i++) newRates[i]=value;

            // 直前だけなだらかに
            const start = Math.max(0,index-SMOOTH_PRE_RANGE);
            const span = index - start;
            if (span>0){
              for (let i=start;i<index;i++){
                const t = (i-start+1)/span;
                newRates[i] = oldData[i]*(1-t) + value*t;
              }
            }
            updateInputsFromRateChart(newRates);
            rateChartInstance.data.datasets[0].data = newRates;
            rateChartInstance.update();
          }
        }
      }
    },
    plugins:[Chart.registry.getPlugin('dragdata')]
  });
}

/* ====== シミュレーション（ルールなし） ====== */
function simulate() {
  const amount = parseAmount(document.getElementById('amount').value);
  const years  = parseInt(document.getElementById('years').value);
  const months = years * 12;
  const repaymentType = document.querySelector("input[name='repaymentType']:checked").value;
  const rates = Array.from(document.querySelectorAll('.rate-input')).map(el => parseFloat(el.value)/100);

  if (!amount || !years){ alert('借入額と返済期間を入力してください。'); return; }
  if (rates.length < Math.ceil(months/6)){ alert('金利の入力が不足しています。'); return; }

  let balance = amount;
  const result = [], payments = [];
  let totalPrincipal = 0, totalInterest = 0;

  for (let m=0; m<months; m++){
    const rateIdx = Math.floor(m/6);
    const annualRate = rates[rateIdx] || 0;
    const r = annualRate/12;
    const remain = months - m;

    let interest = balance*r, principal, paymentOut;
    if (repaymentType==='principalAndInterestEqual'){
      paymentOut = r>0 ? balance*r*Math.pow(1+r,remain)/(Math.pow(1+r,remain)-1) : balance/remain;
      interest = balance*r;
      principal = paymentOut - interest;
    } else {
      principal = amount/months;
      interest  = balance*r;
      paymentOut = principal + interest;
    }

    balance -= principal; if (balance<0) balance=0;
    totalPrincipal += principal; totalInterest += interest;
    payments.push(paymentOut);

    result.push({
      月: m+1,
      元金: Math.round(principal),
      利息: Math.round(interest),
      残高: Math.round(balance),
      支払額: Math.round(paymentOut)
    });
  }

  lastSimData = result;
  displayResult(result, totalPrincipal, totalInterest, payments);
  drawCharts(result);
}

/* ====== 結果表示 ====== */
function displayResult(data, totalPrincipal, totalInterest, payments){
  const totalRepayment = Math.ceil(totalPrincipal + totalInterest);
  const interestRounded = Math.ceil(totalInterest);
  const firstPay = Math.round(payments[0] || 0);
  const avgPay   = Math.round(payments.reduce((a,b)=>a+b,0)/payments.length || 0);
  const maxPay   = Math.round(Math.max(...payments,0));

  const div = document.getElementById('result');
  div.innerHTML = `🏁 総返済額: ${totalRepayment.toLocaleString()} 円\n📊 総利息: ${interestRounded.toLocaleString()} 円`;

  document.getElementById('kpiTiles').style.display='grid';
  document.getElementById('kpi-first').textContent = `${firstPay.toLocaleString()} 円`;
  document.getElementById('kpi-avg').textContent   = `${avgPay.toLocaleString()} 円`;
  document.getElementById('kpi-max').textContent   = `${maxPay.toLocaleString()} 円`;

  const showTable = document.getElementById('toggle-table').checked;
  const tableWrap = document.getElementById('repayment-table');
  tableWrap.innerHTML = '';
  if (showTable){
    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();
    thead.innerHTML = '<tr><th>月</th><th>元金</th><th>利息</th><th>支払額</th><th>残高</th></tr>';
    for (let i=0;i<data.length;i++){
      const r=data[i], tr=tbody.insertRow();
      ['月','元金','利息','支払額','残高'].forEach(k=>{
        const td = tr.insertCell(); td.textContent = r[k].toLocaleString();
      });
    }
    tableWrap.appendChild(table);
  }
}

/* ====== グラフ描画（Y最小値0） ====== */
function drawCharts(data){
  const labels = data.map(d=>d['月']);
  const principalData = data.map(d=>d['元金']);
  const interestData  = data.map(d=>d['利息']);
  const paymentData   = data.map(d=>d['支払額']);

  if (paymentChart) paymentChart.destroy();
  if (stackedChart) stackedChart.destroy();

  const axisFont = { size:14 };
  const common = {
    responsive:true, maintainAspectRatio:false, animation:false,
    scales:{
      x:{ ticks:{ maxRotation:0, autoSkip:true, autoSkipPadding:16, font:axisFont }, grid:{ display:false } },
      y:{ ticks:{ font:axisFont }, grid:{ color:'rgba(0,0,0,0.08)' }, beginAtZero:true, min:0 }
    },
    plugins:{ legend:{ display:false } }
  };

  paymentChart = new Chart(document.getElementById('paymentChart').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ label:'月々の支払額', data:paymentData, backgroundColor:'#0c7e86' }] },
    options:common
  });
  stackedChart = new Chart(document.getElementById('stackedChart').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'元金', data:principalData, backgroundColor:'#0c7e86' },
      { label:'利息', data:interestData,  backgroundColor:'#ffbf3a' }
    ]},
    options:{ ...common, scales:{ ...common.scales, x:{...common.scales.x, stacked:true}, y:{...common.scales.y, stacked:true} } }
  });
}

/* ====== Excel出力 ====== */
function downloadExcel(){
  if (!lastSimData.length){ alert('まずシミュレーションを実行してください。'); return; }
  const ws = XLSX.utils.json_to_sheet(lastSimData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '返済シミュレーション');
  XLSX.writeFile(wb, 'loan_simulation.xlsx');
}

/* テーブル表示トグル時の再描画 */
document.addEventListener('change', (e)=>{
  if (e.target && e.target.id === 'toggle-table' && lastSimData.length){
    let totalPrincipal=0,totalInterest=0;
    for(const r of lastSimData){ totalPrincipal+=r['元金']; totalInterest+=r['利息']; }
    const payments = lastSimData.map(r=>r['支払額']);
    displayResult(lastSimData, totalPrincipal, totalInterest, payments);
  }
});
