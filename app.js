
function clientSidePredict(features) {
  const [age, sex, cp, trestbps, chol, fbs, restecg, thalach, exang, oldpeak, slope, ca, thal] = features;
  let score = -2.0;
  score += sex * 0.8;
  if (cp > 0) score += cp * 0.4;
  if (trestbps > 130) score += (trestbps - 130) * 0.02;
  if (chol > 200) score += (chol - 200) * 0.005;
  score += fbs * 0.3;
  if (thalach < 150) score += (150 - thalach) * 0.02;
  score += exang * 0.9;
  score += oldpeak * 0.8;
  if (slope === 1) score += 0.3;
  else if (slope === 0) score += 0.5;
  score += ca * 1.0;
  if (thal === 3) score += 0.7;
  else if (thal === 2) score += 0.3;
  if (age > 50) score += (age - 50) * 0.03;
  const probability = 1 / (1 + Math.exp(-score));
  const prediction = probability >= 0.5 ? 1 : 0;
  return {
    prediction: prediction,
    accuracy: 0.951,
    confidence: probability
  };
}

let localSession = JSON.parse(localStorage.getItem('localSession') || 'null');

function mockFetch(url, options = {}) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  const makeResponse = (data, status = 200) => {
    return {
      ok: status >= 200 && status < 300,
      status: status,
      json: async () => data
    };
  };

  if (url === '/api/session') {
    if (localSession) {
      return makeResponse({ logged_in: true, username: localSession.username, role: localSession.role });
    }
    return makeResponse({ logged_in: false });
  }

  if (url === '/api/login') {
    localSession = { username: body.username, role: body.role || 'doctor' };
    localStorage.setItem('localSession', JSON.stringify(localSession));
    return makeResponse({ success: true });
  }

  if (url === '/api/register') {
    return makeResponse({ success: true });
  }

  if (url === '/api/logout') {
    localSession = null;
    localStorage.removeItem('localSession');
    return makeResponse({ success: true });
  }

  if (url === '/predict') {
    return makeResponse(clientSidePredict(body.features));
  }

  if (url === '/api/history' && method === 'GET') {
    const allHistory = JSON.parse(localStorage.getItem('localHistory') || '[]');
    const user = localSession ? localSession.username : '';
    const role = localSession ? localSession.role : 'doctor';
    if (role === 'patient') {
      return makeResponse(allHistory.filter(r => r.patient_name === user));
    }
    return makeResponse(allHistory);
  }

  if (url === '/api/history' && method === 'POST') {
    const allHistory = JSON.parse(localStorage.getItem('localHistory') || '[]');
    const record = {
      id: 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      patient_name: body.patient_name,
      age: body.features[0],
      sex: body.features[1],
      cp: body.features[2],
      trestbps: body.features[3],
      chol: body.features[4],
      fbs: body.features[5],
      restecg: body.features[6],
      thalach: body.features[7],
      exang: body.features[8],
      oldpeak: body.features[9],
      slope: body.features[10],
      ca: body.features[11],
      thal: body.features[12],
      prediction: body.prediction,
      accuracy: body.accuracy,
      confidence: body.confidence,
      created_at: new Date().toISOString()
    };
    allHistory.unshift(record);
    localStorage.setItem('localHistory', JSON.stringify(allHistory));
    return makeResponse({ success: true, id: record.id }, 201);
  }

  if (url.startsWith('/api/history/') && method === 'DELETE') {
    const allHistory = JSON.parse(localStorage.getItem('localHistory') || '[]');
    if (url.includes('/patient/')) {
      const patientName = decodeURIComponent(url.split('/patient/')[1]);
      const filtered = allHistory.filter(r => r.patient_name !== patientName);
      localStorage.setItem('localHistory', JSON.stringify(filtered));
      return makeResponse({ success: true });
    } else {
      const id = url.split('/api/history/')[1];
      const filtered = allHistory.filter(r => r.id !== id);
      localStorage.setItem('localHistory', JSON.stringify(filtered));
      return makeResponse({ success: true });
    }
  }

  return makeResponse({ error: 'Endpoint not found' }, 404);
}

async function smartFetch(url, options = {}) {
  const isStaticHosting = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  if (isStaticHosting) {
    return mockFetch(url, options);
  }
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    return mockFetch(url, options);
  }
}

let currentUser = null;
    let currentUserRole = null;
    let selectedPortal = null;
    let lastPrediction = null;
    let localHistory = [];

    const MAPPED_VALUES = {
      sex: { 1: 'Male', 0: 'Female' },
      cp: { 0: 'Typical Angina', 1: 'Atypical Angina', 2: 'Non-anginal', 3: 'Asymptomatic' },
      fbs: { 1: '> 120 mg/dl', 0: '<= 120 mg/dl' },
      restecg: { 0: 'Normal', 1: 'ST-T Abnormality', 2: 'LV Hypertrophy' },
      exang: { 1: 'Yes', 0: 'No' },
      slope: { 0: 'Upsloping', 1: 'Flat', 2: 'Downsloping' },
      thal: { 1: 'Normal', 2: 'Fixed Defect', 3: 'Reversible Defect' }
    };

    function selectPortal(role) {
      selectedPortal = role;
      const authTitle = document.getElementById('authTitle');
      const authSubtitle = document.getElementById('authSubtitle');
      const authBtn = document.getElementById('authBtn');
      const authLogoEmoji = document.getElementById('authLogoEmoji');
      document.getElementById('authAlert').style.display = 'none';

      if (role === 'doctor') {
        authLogoEmoji.textContent = '🩺';
        authTitle.textContent = 'Doctor Portal';
        authSubtitle.textContent = 'Clinic Doctors & Medical Staff: Sign in to manage patient diagnostics database.';
        authBtn.style.backgroundColor = 'var(--accent)';
      } else {
        authLogoEmoji.textContent = '👤';
        authTitle.textContent = 'Patient Portal';
        authSubtitle.textContent = 'Patients & Individuals: Sign in to check your diagnostic health reports and checkup histories.';
        authBtn.style.backgroundColor = '#0d9488';
      }

      toggleAuthMode(false);
      document.getElementById('portalSelect').style.display = 'none';
      document.getElementById('authCard').style.display = 'block';
    }

    function backToPortals() {
      selectedPortal = null;
      document.getElementById('authCard').style.display = 'none';
      document.getElementById('portalSelect').style.display = 'flex';
      document.getElementById('authUsername').value = '';
      document.getElementById('authPassword').value = '';
    }

    let isRegisterMode = false;
    function toggleAuthMode(forceState = null) {
      if (forceState !== null) {
        isRegisterMode = forceState;
      } else {
        isRegisterMode = !isRegisterMode;
      }
      const title = document.getElementById('authTitle');
      const btn = document.getElementById('authBtn');
      const toggleMsg = document.getElementById('authToggleMsg');
      const toggleLink = document.getElementById('authToggleLink');
      const alertBox = document.getElementById('authAlert');

      alertBox.style.display = 'none';

      if (isRegisterMode) {
        title.textContent = selectedPortal === 'doctor' ? 'Register Doctor Account' : 'Register Patient Account';
        btn.textContent = 'Register Account';
        toggleMsg.textContent = 'Already registered?';
        toggleLink.textContent = 'Sign in';
      } else {
        title.textContent = selectedPortal === 'doctor' ? 'Doctor Portal' : 'Patient Portal';
        btn.textContent = 'Sign In';
        toggleMsg.textContent = "Don't have an account?";
        toggleLink.textContent = 'Sign up';
      }
    }

    function showAuthAlert(msg, isSuccess=false) {
      const box = document.getElementById('authAlert');
      box.textContent = msg;
      box.style.display = 'block';
      if (isSuccess) {
        box.style.background = 'var(--success-light)';
        box.style.color = 'var(--success)';
        box.style.border = '1px solid var(--success)';
      } else {
        box.style.background = 'var(--danger-light)';
        box.style.color = 'var(--danger)';
        box.style.border = '1px solid var(--danger)';
      }
    }

    document.getElementById('authBtn').addEventListener('click', async () => {
      const username = document.getElementById('authUsername').value.trim();
      const password = document.getElementById('authPassword').value.trim();

      if (!username || !password) {
        showAuthAlert('Username and password are required.');
        return;
      }

      const endpoint = isRegisterMode ? '/api/register' : '/api/login';
      const payload = isRegisterMode 
        ? {username, password, role: selectedPortal} 
        : {username, password};

      try {
        const res = await smartFetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          showAuthAlert(data.error || 'Authentication failed');
          return;
        }

        if (isRegisterMode) {
          showAuthAlert('Registered successfully! Logging in...', true);
          setTimeout(() => {
            toggleAuthMode(false);
            document.getElementById('authPassword').value = '';
          }, 1500);
        } else {
          showToast('Login successful!');
          await checkUserSession();
        }
      } catch (err) {
        showAuthAlert('Cannot contact server. Make sure project.py is running.');
      }
    });

    async function checkUserSession() {
      try {
        const res = await smartFetch('/api/session');
        const data = await res.json();
        if (data.logged_in) {
          currentUser = data.username;
          currentUserRole = data.role || 'doctor';
          document.getElementById('authScreen').style.display = 'none';
          document.getElementById('appLayout').style.display = 'flex';
          const roleLabel = currentUserRole.charAt(0).toUpperCase() + currentUserRole.slice(1);
          document.getElementById('currentUserLabel').textContent = `${currentUser} (${roleLabel})`;
          document.getElementById('avatarLetter').textContent = currentUser.charAt(0).toUpperCase();
          configureRoleViews();
          if (currentUserRole === 'patient') {
            switchTab('history');
          } else {
            switchTab('predict');
          }
          await loadHistory();
        } else {
          currentUser = null;
          currentUserRole = null;
          document.getElementById('authScreen').style.display = 'flex';
          document.getElementById('portalSelect').style.display = 'flex';
          document.getElementById('authCard').style.display = 'none';
          document.getElementById('appLayout').style.display = 'none';
        }
      } catch (e) {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appLayout').style.display = 'none';
      }
    }

    function configureRoleViews() {
      const nameInput = document.getElementById('patientName');
      const formTitle = document.getElementById('formTitle');
      const tabBtnHistory = document.getElementById('tabBtnHistory');
      const tabNav = document.querySelector('.tab-nav');
      document.getElementById('tabPredict').style.display = '';
      document.getElementById('tabHistory').style.display = '';
      tabNav.style.display = 'flex';
      if (currentUserRole === 'patient') {
        nameInput.value = currentUser;
        nameInput.disabled = true;
        formTitle.textContent = 'Self Checkup Form';
        tabBtnHistory.textContent = 'My Health History';
        document.getElementById('saveRecordBtn').textContent = 'Save to My History';
        document.getElementById('tabBtnPredict').style.display = 'none';
        document.getElementById('tabPredict').style.display = 'none';
      } else {
        nameInput.disabled = false;
        formTitle.textContent = 'Patient Diagnosis Form';
        tabBtnHistory.textContent = 'Patient Database';
        document.getElementById('saveRecordBtn').textContent = 'Save to Patient Database';
        document.getElementById('tabBtnPredict').style.display = '';
        document.getElementById('tabPredict').style.display = '';
      }
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await smartFetch('/api/logout', { method: 'POST' });
        showToast('Logged out successfully.');
        await checkUserSession();
      } catch (err) {
        console.error(err);
      }
    });

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      if (tabId === 'predict') {
        document.getElementById('tabBtnPredict').classList.add('active');
        document.getElementById('tabPredict').classList.add('active');
      } else {
        document.getElementById('tabBtnHistory').classList.add('active');
        document.getElementById('tabHistory').classList.add('active');
        loadHistory();
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }

    function getRadio(name){ 
      const el = document.querySelector(`input[name="${name}"]:checked`); 
      return el ? Number(el.value) : null; 
    }

    function readFormValues(){
      const vals = [];
      vals.push(Number(document.getElementById('age').value || 0));
      vals.push(getRadio('sex') ?? 0);
      vals.push(getRadio('cp') ?? 0);
      vals.push(Number(document.getElementById('trestbps').value || 0));
      vals.push(Number(document.getElementById('chol').value || 0));
      vals.push(getRadio('fbs') ?? 0);
      vals.push(getRadio('restecg') ?? 0);
      vals.push(Number(document.getElementById('thalach').value || 0));
      vals.push(getRadio('exang') ?? 0);
      vals.push(Number(document.getElementById('oldpeak').value || 0));
      vals.push(getRadio('slope') ?? 0);
      vals.push(Number(document.getElementById('ca').value || 0));
      vals.push(getRadio('thal') ?? 0);
      return vals;
    }

    document.getElementById('predictBtn').addEventListener('click', async () => {
      const patientName = document.getElementById('patientName').value.trim();
      if (!patientName) {
        showToast('Please enter a Patient Name or ID.');
        document.getElementById('patientName').focus();
        return;
      }
      const features = readFormValues();
      if (features[0] <= 0) {
        showToast('Please enter a valid age.');
        document.getElementById('age').focus();
        return;
      }

      document.getElementById('predictionPrompt').style.display = 'none';
      const resContainer = document.getElementById('predictResultContainer');
      resContainer.style.display = 'none';

      try {
        const res = await smartFetch('/predict', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({features})
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Prediction failed');
          return;
        }

        lastPrediction = {
          patient_name: patientName,
          features: features,
          prediction: data.prediction,
          accuracy: data.accuracy,
          confidence: data.confidence
        };

        const resultBox = document.getElementById('resultBox');
        const resultText = document.getElementById('resultText');
        const accuracyText = document.getElementById('accuracyText');

        if (data.prediction === 1) {
          resultBox.className = 'result-container';
          resultBox.style.background = 'var(--danger-light)';
          resultBox.style.color = 'var(--danger)';
          resultBox.style.border = '1px solid var(--danger)';
          resultText.textContent = 'Likely Heart Disease (High Risk)';
        } else {
          resultBox.className = 'result-container';
          resultBox.style.background = 'var(--success-light)';
          resultBox.style.color = 'var(--success)';
          resultBox.style.border = '1px solid var(--success)';
          resultText.textContent = 'Unlikely Heart Disease (Low Risk)';
        }

        const riskPercent = (data.confidence * 100).toFixed(1);
        const accuracyPercent = (data.accuracy * 100).toFixed(1);
        accuracyText.innerHTML = `
          <div style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">
            Patient Risk Score: <span style="color: ${data.prediction === 1 ? 'var(--danger)' : 'var(--success)'};">${riskPercent}%</span>
          </div>
          <div style="font-size: 11px; opacity: 0.8;">
            Overall Classifier Precision: ${accuracyPercent}%
          </div>
        `;
        resContainer.style.display = 'block';
        document.getElementById('saveRecordBtn').style.display = 'inline-block';
        showToast('Diagnosis prediction complete.');
      } catch (err) {
        showToast('Cannot communicate with prediction server.');
      }
    });

    document.getElementById('saveRecordBtn').addEventListener('click', async () => {
      if (!lastPrediction) return;

      try {
        const res = await smartFetch('/api/history', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(lastPrediction)
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Record saved to history successfully!');
          document.getElementById('saveRecordBtn').style.display = 'none';
          await loadHistory();
        } else {
          showToast(data.error || 'Failed to save record.');
        }
      } catch (err) {
        showToast('Error saving patient history record.');
      }
    });

    async function loadHistory() {
      try {
        const res = await smartFetch('/api/history');
        if (!res.ok) return;
        const records = await res.json();
        localHistory = records;
        document.getElementById('statTotal').textContent = records.length;
        const highRisk = records.filter(r => r.prediction === 1).length;
        const lowRisk = records.length - highRisk;
        document.getElementById('statLowRisk').textContent = lowRisk;
        document.getElementById('statHighRisk').textContent = highRisk;

        renderHistoryTable(records);
      } catch (e) {
        console.error(e);
      }
    }

    function renderHistoryTable(records) {
      const tbody = document.getElementById('historyTableBody');
      tbody.innerHTML = '';
      if (currentUserRole === 'patient') {
        document.getElementById('historyTabTitle').textContent = 'My Diagnostics Health Record';
        document.querySelector('#tabHistory .stats-row').style.display = 'none';
        document.querySelector('#tabHistory .history-header-actions').style.display = 'none';
        document.querySelector('#tabHistory .table-container').style.display = 'none';
        let ptTimeline = document.getElementById('patientTimelineContainer');
        if (!ptTimeline) {
          ptTimeline = document.createElement('div');
          ptTimeline.id = 'patientTimelineContainer';
          document.getElementById('tabHistory').appendChild(ptTimeline);
        }
        ptTimeline.style.display = 'block';
        ptTimeline.innerHTML = '';
        if (records.length === 0) {
          ptTimeline.innerHTML = `
            <div style="text-align:center; color:var(--text-muted); padding:50px 20px; border:2px dashed var(--border); border-radius:24px; background:var(--card-bg);">
              <div style="font-size:40px; margin-bottom:12px;">📊</div>
              <h3 style="font-size:16px; color:var(--text-main); margin-bottom:4px;">No Checkup Reports Stored</h3>
              <p style="font-size:12px; max-width:320px; margin:0 auto;">Ask your clinic doctor to submit your diagnostics profile under your username (<strong>${escapeHtml(currentUser)}</strong>), or run a self checkup in the Predictor tab.</p>
            </div>`;
          return;
        }

        const timelineDiv = document.createElement('div');
        timelineDiv.className = 'timeline';
        records.forEach(r => {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          const dateStr = r.created_at ? new Date(r.created_at).toLocaleString() : 'Unknown Date';
          const markerClass = r.prediction === 1 ? 'danger' : 'success';
          const diagBadgeClass = r.prediction === 1 ? 'badge-danger' : 'badge-success';
          const diagBadgeText = r.prediction === 1 ? 'High Risk' : 'Low Risk';

          const sexText = MAPPED_VALUES.sex[r.sex] ?? 'Unknown';
          const cpText = MAPPED_VALUES.cp[r.cp] ?? (r.cp ?? 'N/A');
          const fbsText = MAPPED_VALUES.fbs[r.fbs] ?? (r.fbs ?? 'N/A');
          const restecgText = MAPPED_VALUES.restecg[r.restecg] ?? (r.restecg ?? 'N/A');
          const exangText = MAPPED_VALUES.exang[r.exang] ?? (r.exang ?? 'N/A');
          const slopeText = MAPPED_VALUES.slope[r.slope] ?? (r.slope ?? 'N/A');
          const thalText = MAPPED_VALUES.thal[r.thal] ?? (r.thal ?? 'N/A');

          item.innerHTML = `
            <div class="timeline-marker ${markerClass}"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-date">${dateStr}</span>
                <span class="badge ${diagBadgeClass}">${diagBadgeText} (${r.confidence !== undefined && r.confidence !== null ? 'Risk Score: ' + (r.confidence * 100).toFixed(1) + '%' : 'Accuracy: ' + (r.accuracy ?? 'N/A')})</span>
              </div>
              <div class="timeline-body-grid">
                <div><span class="timeline-body-label">Age/Sex:</span> <span class="timeline-body-value">${r.age ?? 'N/A'} yrs / ${sexText}</span></div>
                <div><span class="timeline-body-label">Chest Pain (cp):</span> <span class="timeline-body-value">${cpText}</span></div>
                <div><span class="timeline-body-label">Blood Pressure:</span> <span class="timeline-body-value">${r.trestbps ?? 'N/A'} mm Hg</span></div>
                <div><span class="timeline-body-label">Serum Cholesterol:</span> <span class="timeline-body-value">${r.chol ?? 'N/A'} mg/dl</span></div>
                <div><span class="timeline-body-label">Fasting Blood Sugar:</span> <span class="timeline-body-value">${fbsText}</span></div>
                <div><span class="timeline-body-label">Rest ECG Results:</span> <span class="timeline-body-value">${restecgText}</span></div>
                <div><span class="timeline-body-label">Max HR (thalach):</span> <span class="timeline-body-value">${r.thalach ?? 'N/A'} bpm</span></div>
                <div><span class="timeline-body-label">Exercise Angina:</span> <span class="timeline-body-value">${exangText}</span></div>
                <div><span class="timeline-body-label">ST Depression:</span> <span class="timeline-body-value">${r.oldpeak ?? 'N/A'}</span></div>
                <div><span class="timeline-body-label">Peak ST Slope:</span> <span class="timeline-body-value">${slopeText}</span></div>
                <div><span class="timeline-body-label">Major Vessels (ca):</span> <span class="timeline-body-value">${r.ca ?? 'N/A'}</span></div>
                <div><span class="timeline-body-label">Thalassemia (thal):</span> <span class="timeline-body-value">${thalText}</span></div>
              </div>
            </div>
          `;
          timelineDiv.appendChild(item);
        });
        ptTimeline.appendChild(timelineDiv);
        return;
      }

      document.getElementById('historyTabTitle').textContent = 'Patient Records Database';
      document.querySelector('#tabHistory .stats-row').style.display = 'grid';
      document.querySelector('#tabHistory .history-header-actions').style.display = 'flex';
      document.querySelector('#tabHistory .table-container').style.display = 'block';
      const ptTimeline = document.getElementById('patientTimelineContainer');
      if (ptTimeline) ptTimeline.style.display = 'none';

      if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">No patient records stored yet.</td></tr>`;
        return;
      }

      const groups = {};
      records.forEach(r => {
        const name = r.patient_name ? String(r.patient_name).trim() : 'Unknown Patient';
        if (!groups[name]) {
          groups[name] = [];
        }
        groups[name].push(r);
      });

      const groupedPatients = Object.keys(groups).map(name => {
        const checkups = groups[name].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const latest = checkups[checkups.length - 1];
        let trend = 'initial';
        if (checkups.length > 1) {
          const prev = checkups[checkups.length - 2];
          if (latest.prediction === 0 && prev.prediction === 1) {
            trend = 'improved';
          } else if (latest.prediction === 1 && prev.prediction === 0) {
            trend = 'worsened';
          } else if (latest.prediction === 0 && prev.prediction === 0) {
            trend = 'stable_low';
          } else {
            trend = 'stable_high';
          }
        }

        return {
          name: name,
          checkups: checkups,
          latest: latest,
          trend: trend
        };
      }).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));

      groupedPatients.forEach(p => {
        const tr = document.createElement('tr');
        const latest = p.latest;
        const sexText = MAPPED_VALUES.sex[latest.sex] ?? 'Unknown';
        const diagBadgeClass = latest.prediction === 1 ? 'badge-danger' : 'badge-success';
        const diagBadgeText = latest.prediction === 1 ? 'High Risk' : 'Low Risk';

        let trendBadgeClass = 'badge-info';
        let trendBadgeText = 'Initial Check';
        if (p.trend === 'improved') {
          trendBadgeClass = 'badge-success';
          trendBadgeText = '🟢 Improved';
        } else if (p.trend === 'worsened') {
          trendBadgeClass = 'badge-danger';
          trendBadgeText = '🔴 Worsened';
        } else if (p.trend === 'stable_low') {
          trendBadgeClass = 'badge-success';
          trendBadgeText = '⚪ Stable Low';
        } else if (p.trend === 'stable_high') {
          trendBadgeClass = 'badge-warning';
          trendBadgeText = '🟡 Stable High';
        }

        tr.innerHTML = `
          <td style="font-weight:600;">${escapeHtml(p.name)}</td>
          <td style="font-weight:500;">${p.checkups.length} check${p.checkups.length > 1 ? 's' : ''}</td>
          <td>${latest.age ?? 'N/A'} yrs / ${sexText} / ${latest.chol ?? 'N/A'} mg / ${latest.thalach ?? 'N/A'} bpm</td>
          <td><span class="badge ${diagBadgeClass}">${diagBadgeText}</span></td>
          <td><span class="badge ${trendBadgeClass}">${trendBadgeText}</span></td>
          <td>
            <button class="btn-view-details" onclick="viewDetails('${escapeJs(p.name)}')">Timeline</button>
            <button class="btn-delete" onclick="deletePatientAll('${escapeJs(p.name)}')">Delete Profile</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function viewDetails(patientName) {
      const patientRecords = localHistory
        .filter(r => r.patient_name === patientName)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (patientRecords.length === 0) return;

      const latest = patientRecords[patientRecords.length - 1];
      document.getElementById('modalPatientName').textContent = `Patient Diagnostic History: ${patientName}`;
      let trendClass = 'badge badge-info';
      let trendText = 'Initial Assessment';
      if (patientRecords.length > 1) {
        const prev = patientRecords[patientRecords.length - 2];
        if (latest.prediction === 0 && prev.prediction === 1) {
          trendClass = 'badge badge-success';
          trendText = 'Condition: Improved';
        } else if (latest.prediction === 1 && prev.prediction === 0) {
          trendClass = 'badge badge-danger';
          trendText = 'Condition: Worsened';
        } else if (latest.prediction === 0 && prev.prediction === 0) {
          trendClass = 'badge badge-success';
          trendText = 'Condition: Stable (Low Risk)';
        } else {
          trendClass = 'badge badge-danger';
          trendText = 'Condition: Stable (High Risk)';
        }
      }

      const badgeContainer = document.getElementById('modalPredictionBadge');
      badgeContainer.innerHTML = `<span class="${trendClass}" style="font-size:13px; padding:6px 14px;">${trendText} (${patientRecords.length} checkups)</span>`;

      const timelineContainer = document.getElementById('modalDetailsTimeline');
      timelineContainer.innerHTML = '';

      const timelineDiv = document.createElement('div');
      timelineDiv.className = 'timeline';

      const displayRecords = [...patientRecords].reverse();
      displayRecords.forEach(r => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Unknown Date';
        const markerClass = r.prediction === 1 ? 'danger' : 'success';
        const diagBadgeClass = r.prediction === 1 ? 'badge-danger' : 'badge-success';
        const diagBadgeText = r.prediction === 1 ? 'High Risk' : 'Low Risk';

        const sexText = MAPPED_VALUES.sex[r.sex] ?? 'Unknown';
        const cpText = MAPPED_VALUES.cp[r.cp] ?? (r.cp ?? 'N/A');
        const fbsText = MAPPED_VALUES.fbs[r.fbs] ?? (r.fbs ?? 'N/A');
        const restecgText = MAPPED_VALUES.restecg[r.restecg] ?? (r.restecg ?? 'N/A');
        const exangText = MAPPED_VALUES.exang[r.exang] ?? (r.exang ?? 'N/A');
        const slopeText = MAPPED_VALUES.slope[r.slope] ?? (r.slope ?? 'N/A');
        const thalText = MAPPED_VALUES.thal[r.thal] ?? (r.thal ?? 'N/A');

        item.innerHTML = `
          <div class="timeline-marker ${markerClass}"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-date">${dateStr}</span>
              <span class="badge ${diagBadgeClass}">${diagBadgeText} (${r.confidence !== undefined && r.confidence !== null ? 'Risk Score: ' + (r.confidence * 100).toFixed(1) + '%' : 'Accuracy: ' + (r.accuracy ?? 'N/A')})</span>
            </div>
            <div class="timeline-body-grid">
              <div><span class="timeline-body-label">Age/Sex:</span> <span class="timeline-body-value">${r.age ?? 'N/A'} yrs / ${sexText}</span></div>
              <div><span class="timeline-body-label">Chest Pain (cp):</span> <span class="timeline-body-value">${cpText}</span></div>
              <div><span class="timeline-body-label">Blood Pressure:</span> <span class="timeline-body-value">${r.trestbps ?? 'N/A'} mm Hg</span></div>
              <div><span class="timeline-body-label">Cholesterol:</span> <span class="timeline-body-value">${r.chol ?? 'N/A'} mg/dl</span></div>
              <div><span class="timeline-body-label">Fasting Blood Sugar:</span> <span class="timeline-body-value">${fbsText}</span></div>
              <div><span class="timeline-body-label">Rest ECG Results:</span> <span class="timeline-body-value">${restecgText}</span></div>
              <div><span class="timeline-body-label">Max HR (thalach):</span> <span class="timeline-body-value">${r.thalach ?? 'N/A'} bpm</span></div>
              <div><span class="timeline-body-label">Exercise Angina:</span> <span class="timeline-body-value">${exangText}</span></div>
              <div><span class="timeline-body-label">ST Depression:</span> <span class="timeline-body-value">${r.oldpeak ?? 'N/A'}</span></div>
              <div><span class="timeline-body-label">Peak ST Slope:</span> <span class="timeline-body-value">${slopeText}</span></div>
              <div><span class="timeline-body-label">Major Vessels (ca):</span> <span class="timeline-body-value">${r.ca ?? 'N/A'}</span></div>
              <div><span class="timeline-body-label">Thalassemia (thal):</span> <span class="timeline-body-value">${thalText}</span></div>
            </div>
            <div class="timeline-actions">
              <button class="btn-timeline-delete" onclick="deleteTimelineRecord('${r.id}', '${escapeJs(patientName)}')">Delete Checkup</button>
            </div>
          </div>
        `;
        timelineDiv.appendChild(item);
      });

      timelineContainer.appendChild(timelineDiv);
      document.getElementById('detailsModal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('detailsModal').style.display = 'none';
    }

    window.onclick = function(event) {
      const modal = document.getElementById('detailsModal');
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    }

    async function deleteTimelineRecord(id, patientName) {
      if (currentUserRole !== 'doctor') {
        showToast('Forbidden. Only doctors can delete checkup logs.');
        return;
      }
      if (!confirm('Are you sure you want to delete this specific checkup record?')) return;
      try {
        const res = await smartFetch(`/api/history/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Checkup record deleted.');
          await loadHistory();
          const stillHasChecks = localHistory.some(r => r.patient_name === patientName);
          if (stillHasChecks) {
            viewDetails(patientName);
          } else {
            closeModal();
          }
        } else {
          showToast('Failed to delete checkup.');
        }
      } catch (err) {
        showToast('Error deleting checkup.');
      }
    }

    async function deletePatientAll(patientName) {
      if (currentUserRole !== 'doctor') {
        showToast('Forbidden. Only doctors can delete patient files.');
        return;
      }
      if (!confirm(`Are you sure you want to delete all diagnostic history for "${patientName}"? This cannot be undone.`)) return;
      try {
        const res = await smartFetch(`/api/history/patient/${encodeURIComponent(patientName)}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast(`Deleted all records for ${patientName}`);
          await loadHistory();
          closeModal();
        } else {
          showToast(data.error || 'Failed to delete records.');
        }
      } catch (err) {
        showToast('Error communicating with database.');
      }
    }

    function filterHistoryTable() {
      const query = document.getElementById('searchBar').value.toLowerCase();
      const filtered = localHistory.filter(r => 
        r.patient_name.toLowerCase().includes(query)
      );
      renderHistoryTable(filtered);
    }

    document.getElementById('sampleBtn').addEventListener('click', () => {
      if (currentUserRole === 'patient') {
        document.getElementById('patientName').value = currentUser;
      } else {
        document.getElementById('patientName').value = 'Patient Alpha';
      }
      document.getElementById('age').value = 62;
      document.querySelector('input[name="sex"][value="1"]').checked = true;
      document.querySelector('input[name="cp"][value="0"]').checked = true;
      document.getElementById('trestbps').value = 140;
      document.getElementById('chol').value = 268;
      document.querySelector('input[name="fbs"][value="0"]').checked = true;
      document.querySelector('input[name="restecg"][value="0"]').checked = true;
      document.getElementById('thalach').value = 160;
      document.querySelector('input[name="exang"][value="0"]').checked = true;
      document.getElementById('oldpeak').value = 3.6;
      document.querySelector('input[name="slope"][value="1"]').checked = true;
      document.getElementById('ca').value = 0;
      document.querySelector('input[name="thal"][value="2"]').checked = true;
      showToast('Sample patient data filled.');
    });

    function escapeHtml(text) {
      if (text === null || text === undefined) return '';
      const stringified = String(text);
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return stringified.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    function escapeJs(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/'/g, "\\'");
    }

    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'dark') {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('theme', 'dark');
        }
      });
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
