require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const patientsRoutes = require('./routes/patients.routes');
const assessmentsRoutes = require('./routes/assessments.routes');
const sensorsRoutes = require('./routes/sensors.routes');
const xrayRoutes = require('./routes/xray.routes');
const riskRoutes = require('./routes/risk.routes');
const referralsRoutes = require('./routes/referrals.routes');
const syncRoutes = require('./routes/sync.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

app.use(helmet());
app.use(cors()); // tighten to your deployed frontend origin(s) before demo day
app.use(express.json({ limit: '5mb' })); // sensor sessions can carry a fair bit of raw IMU/pose data
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Everything below requires a valid Supabase auth token
app.use('/api', requireAuth);

app.use('/api/patients', patientsRoutes);
// nested resources under a specific patient
app.use('/api/patients/:patientId/assessments', assessmentsRoutes);
app.use('/api/patients/:patientId/sensor-sessions', sensorsRoutes);
app.use('/api/patients/:patientId/xray-studies', xrayRoutes);
app.use('/api/patients/:patientId/risk-assessment', riskRoutes);

// flat/top-level resources
app.use('/api/assessments', assessmentsRoutes);
app.use('/api/sensor-sessions', sensorsRoutes);
app.use('/api/xray-studies', xrayRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`OA screening backend listening on port ${port}`);
});

module.exports = app;
