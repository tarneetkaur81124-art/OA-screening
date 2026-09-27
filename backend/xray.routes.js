const { Router } = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireHealthWorker } = require('../middleware/auth');
const { createXrayStudy, listXrayStudiesForPatient } = require('../controllers/xray.controller');

// Mounted at /api/xray-studies and /api/patients/:patientId/xray-studies
const router = Router({ mergeParams: true });

router.use(requireHealthWorker); // radiographs are captured/uploaded by health workers in the field

router.post('/', asyncHandler(createXrayStudy));
router.get('/', asyncHandler(listXrayStudiesForPatient));

module.exports = router;
