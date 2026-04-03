const express = require('express');
const multer = require('multer');
const upload = multer({ 
  memoryStorage: true,
  limits: { fileSize: 5 * 1024 * 1024 }
});
const authMiddleware = require('../middleware/auth');
const { 
    stateLogin, 
    fetchAllDistricts, 
    fetchAllDistrictsPublic,
    fetchDistrictById,
    municipalLogin,
    fetchComplaintsByMunicipality,
    getComplaintCategories,
    getStateStats,
    updateComplaintStatus,
    getComplaintById,
    uploadEvidence,
    getComplaintsWithFilters
} = require('../controllers/adminController');

const router = express.Router();

router.post('/state/login', stateLogin);
router.post('/state/allDistricts', authMiddleware, fetchAllDistricts);
router.get('/state/allDistricts', fetchAllDistrictsPublic);
router.post('/state/fetchDistrict', authMiddleware, fetchDistrictById);
router.get('/state/stats', authMiddleware, getStateStats);

router.post('/municipal/login', municipalLogin);
router.post('/municipal/allDistricts', fetchAllDistrictsPublic);
router.post('/municipal/fetchDistrict', authMiddleware, fetchDistrictById);
router.post('/municipal/fetchByName', authMiddleware, fetchComplaintsByMunicipality);

router.get('/categories', getComplaintCategories);

router.patch('/complaint/update', authMiddleware, updateComplaintStatus);
router.get('/complaint/:id', authMiddleware, getComplaintById);
router.post('/complaint/uploadEvidence', authMiddleware, upload.single('evidence'), uploadEvidence);
router.post('/complaint/filter', authMiddleware, getComplaintsWithFilters);

module.exports = router;