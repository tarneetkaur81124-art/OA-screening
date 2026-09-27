const { Router } = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireHealthWorker } = require('../middleware/auth');
const { createSensorSession, listSessionsForPatient } = require('../controllers/sensors.controller');

const router = Router({ mergeParams: true });

router.use(requireHealthWorker); // sensor kits are operated by health workers in the field

router.post('/', asyncHandler(createSensorSession));
router.get('/', asyncHandler(listSessionsForPatient));

module.exports = router;
